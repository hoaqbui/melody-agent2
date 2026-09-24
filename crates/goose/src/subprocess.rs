use rmcp::transport::TokioChildProcess;
use std::io;
#[cfg(target_os = "linux")]
use std::sync::{mpsc, OnceLock};
use tokio::process::ChildStderr;
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;

#[cfg(target_os = "linux")]
fn configure_parent_death_signal(command: &mut Command) {
    let parent_pid = unsafe { libc::getpid() };

    unsafe {
        command.pre_exec(move || {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) != 0 {
                return Err(std::io::Error::last_os_error());
            }

            if libc::getppid() != parent_pid {
                return Err(std::io::Error::from_raw_os_error(libc::ESRCH));
            }

            Ok(())
        });
    }
}

pub trait SubprocessExt {
    fn set_no_window(&mut self) -> &mut Self;
}

/// Creates a Git command that rejects implicit bare repositories and cannot run a
/// repository-configured fsmonitor hook.
pub fn git_command() -> std::process::Command {
    let mut command = std::process::Command::new("git");
    command.args([
        "-c",
        "safe.bareRepository=explicit",
        "-c",
        "core.fsmonitor=false",
    ]);
    command
}

impl SubprocessExt for Command {
    fn set_no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            self.creation_flags(CREATE_NO_WINDOW_FLAG);
        }
        self
    }
}

impl SubprocessExt for std::process::Command {
    fn set_no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW_FLAG);
        }
        self
    }
}

fn configure_common_subprocess(command: &mut Command) {
    // Isolate subprocess into its own process group so it does not receive
    // SIGINT when the user presses Ctrl+C in the terminal.
    #[cfg(unix)]
    command.process_group(0);
    command.set_no_window();
}

#[cfg(unix)]
const PROCESS_GROUP_KILL_GRACE: std::time::Duration = std::time::Duration::from_secs(1);

/// Terminates the process group led by `pid` (see `configure_subprocess`'s
/// `process_group(0)`, which makes the child its own group leader): SIGTERM
/// now, SIGKILL after a short grace if anything in the group is still alive.
/// Reaches descendants (e.g. a shell/interpreter the child spawned) that a
/// plain `Child::kill` on `pid` alone would orphan. Fire-and-forget on a
/// dedicated thread so a caller in a `Drop` impl or an async task never waits
/// on the grace period.
#[cfg(unix)]
pub fn terminate_process_group(pid: u32) {
    let pgid = -(pid as libc::pid_t);
    unsafe {
        libc::kill(pgid, libc::SIGTERM);
    }
    std::thread::spawn(move || {
        std::thread::sleep(PROCESS_GROUP_KILL_GRACE);
        unsafe {
            libc::kill(pgid, libc::SIGKILL);
        }
    });
}

#[allow(unused_variables)]
pub fn configure_subprocess(command: &mut Command) {
    configure_common_subprocess(command);
    #[cfg(target_os = "linux")]
    configure_parent_death_signal(command);
}

#[cfg(target_os = "linux")]
struct LongLivedSpawnRequest {
    command: Command,
    runtime: tokio::runtime::Handle,
    response: tokio::sync::oneshot::Sender<io::Result<(TokioChildProcess, Option<ChildStderr>)>>,
}

#[cfg(target_os = "linux")]
fn long_lived_spawn_sender() -> io::Result<mpsc::Sender<LongLivedSpawnRequest>> {
    static SENDER: OnceLock<io::Result<mpsc::Sender<LongLivedSpawnRequest>>> = OnceLock::new();

    match SENDER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<LongLivedSpawnRequest>();
        std::thread::Builder::new()
            .name("goose-extension-spawner".to_owned())
            .spawn(move || {
                while let Ok(mut request) = receiver.recv() {
                    let _runtime_guard = request.runtime.enter();
                    configure_subprocess(&mut request.command);
                    let result = TokioChildProcess::builder(request.command)
                        .stderr(std::process::Stdio::piped())
                        .spawn();
                    let _ = request.response.send(result);
                }
            })
            .map(|_| sender)
    }) {
        Ok(sender) => Ok(sender.clone()),
        Err(error) => Err(io::Error::new(error.kind(), error.to_string())),
    }
}

/// Spawn a long-lived MCP subprocess without tying Linux parent-death cleanup
/// to the Tokio worker that happened to request it.
pub async fn spawn_long_lived_mcp_subprocess(
    command: Command,
) -> io::Result<(TokioChildProcess, Option<ChildStderr>)> {
    #[cfg(target_os = "linux")]
    {
        let runtime = tokio::runtime::Handle::try_current().map_err(io::Error::other)?;
        let (response_tx, response_rx) = tokio::sync::oneshot::channel();
        long_lived_spawn_sender()?
            .send(LongLivedSpawnRequest {
                command,
                runtime,
                response: response_tx,
            })
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "extension spawner exited"))?;
        response_rx
            .await
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "extension spawner exited"))?
    }

    #[cfg(not(target_os = "linux"))]
    {
        let mut command = command;
        configure_subprocess(&mut command);
        TokioChildProcess::builder(command)
            .stderr(std::process::Stdio::piped())
            .spawn()
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::time::Duration;

    /// PIDs `pgrep -g` reports for the process group `pgid` leads (empty once
    /// every member has exited).
    fn processes_in_group(pgid: u32) -> Vec<u32> {
        let output = std::process::Command::new("pgrep")
            .arg("-g")
            .arg(pgid.to_string())
            .output()
            .expect("pgrep runs");
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| line.trim().parse().ok())
            .collect()
    }

    // Task 285: a group-killed provider subprocess must take its own
    // descendants with it, not just the process Goose spawned directly — a
    // shell that forked a long-running interpreter (e.g. Claude Code running
    // a Bash tool) would otherwise survive as an orphan.
    #[tokio::test]
    async fn terminate_process_group_kills_every_member() {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg("sleep 60 & sleep 60 & wait");
        configure_subprocess(&mut cmd);
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());
        let mut child = cmd.spawn().expect("spawn sh");
        let pid = child.id().expect("child has a pid");

        // Let the shell fork both `sleep`s before we look at the group.
        tokio::time::sleep(Duration::from_millis(300)).await;
        let before = processes_in_group(pid);
        assert!(
            before.len() >= 3,
            "expected the shell and its two sleeps in the group: {before:?}"
        );

        terminate_process_group(pid);
        let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;

        // Past SIGTERM and the grace period's SIGKILL.
        tokio::time::sleep(PROCESS_GROUP_KILL_GRACE + Duration::from_millis(500)).await;
        let after = processes_in_group(pid);
        assert!(after.is_empty(), "process group survived: {after:?}");
    }
}
