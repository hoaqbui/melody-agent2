import type { ActionRequired, ToolConfirmationData, ToolConfirmationDiff } from '../types/message';
import { defineMessages, useIntl } from '../i18n';
import { snakeToTitleCase } from '../utils';
import { toolConfirmationDiffLines } from '../workspace/panes/diff/unified-diff';
import ToolApprovalButtons from './ToolApprovalButtons';
import { ToolCallArguments, type ToolCallArgumentValue } from './ToolCallArguments';

const i18n = defineMessages({
  allowToolCallWithName: {
    id: 'toolConfirmation.allowToolCallWithName',
    defaultMessage: 'Allow {toolName}?',
  },
  gooseWouldLikeToCallWithName: {
    id: 'toolConfirmation.gooseWouldLikeToCallWithName',
    defaultMessage: 'Goose would like to call {toolName}. Allow?',
  },
});

// A raw MCP name (`developer__shell`) needs the extension prefix stripped and title-casing;
// an adapter's own tool name (`Write probe.txt`) already reads as a sentence — the same
// "has a space" test the server's `default_tool_title` uses — so it rides through as-is.
function formatToolName(fullName: string): string {
  if (fullName.includes(' ')) return fullName;
  const delimiterIndex = fullName.lastIndexOf('__');
  const shortName = delimiterIndex === -1 ? fullName : fullName.substring(delimiterIndex + 2);
  return snakeToTitleCase(shortName);
}

interface ToolConfirmationBodyProps {
  sessionId: string;
  isClicked: boolean;
  data: ToolConfirmationData;
  diff?: ToolConfirmationDiff;
  // Inside a tool row the arguments already show above the body.
  showArguments: boolean;
}

// The approval itself — title, prompt, the adapter's diff or the arguments, the buttons —
// shared by the standalone card and the inline tool row so both paths read the same.
export function ToolConfirmationBody({
  sessionId,
  isClicked,
  data,
  diff,
  showArguments,
}: ToolConfirmationBodyProps) {
  const intl = useIntl();
  const { generation, id, toolName, arguments: toolArguments, prompt } = data;
  const displayName = formatToolName(toolName);
  const diffLines = diff ? toolConfirmationDiffLines(diff.oldText, diff.newText) : [];

  return (
    <>
      <div className="bg-background-secondary px-4 py-2 text-text-primary">
        {diff
          ? displayName
          : prompt
            ? intl.formatMessage(i18n.allowToolCallWithName, { toolName: displayName })
            : intl.formatMessage(i18n.gooseWouldLikeToCallWithName, { toolName: displayName })}
      </div>
      <div className="px-4 pb-2">
        {prompt && <div className="py-2 text-sm text-amber-600 dark:text-amber-400">{prompt}</div>}
        {diff ? (
          <pre
            className="my-2 overflow-x-auto rounded-md bg-background-secondary p-2 font-mono text-xs"
            data-testid="tool-confirmation-diff"
            data-path={diff.path}
          >
            {diffLines.map((line, index) => (
              <div
                key={index}
                className={
                  line.marker === '+'
                    ? 'text-text-success'
                    : line.marker === '-'
                      ? 'text-text-danger'
                      : 'text-text-secondary'
                }
              >
                {line.marker}
                {line.text}
              </div>
            ))}
          </pre>
        ) : (
          showArguments && (
            <ToolCallArguments args={toolArguments as Record<string, ToolCallArgumentValue>} />
          )
        )}
        <ToolApprovalButtons
          data={{ generation, id, toolName, prompt: prompt ?? undefined, sessionId, isClicked }}
        />
      </div>
    </>
  );
}

interface ToolConfirmationProps {
  sessionId: string;
  isClicked: boolean;
  actionRequiredContent: ActionRequired & { type: 'actionRequired' };
}

export default function ToolConfirmation({
  sessionId,
  isClicked,
  actionRequiredContent,
}: ToolConfirmationProps) {
  return (
    <div
      className="ask-card goose-message-content bg-background-primary border border-border-primary rounded-2xl overflow-hidden"
      data-testid="tool-confirmation"
    >
      <ToolConfirmationBody
        sessionId={sessionId}
        isClicked={isClicked}
        data={actionRequiredContent.data as ToolConfirmationData}
        diff={actionRequiredContent.diff}
        showArguments
      />
    </div>
  );
}
