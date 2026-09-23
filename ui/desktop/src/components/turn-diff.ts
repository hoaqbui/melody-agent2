import type { ToolRequestMessageContent, ToolResponseMessageContent } from '../types/message';

export type TurnDiffKind = 'edit' | 'write';

export interface TurnDiff {
  path: string;
  oldText: string;
  newText: string;
  kind: TurnDiffKind;
}

interface AcpDiffContentItem {
  type: 'diff';
  path: string;
  oldText?: string;
  newText: string;
}

function isAcpDiffContentItem(item: unknown): item is AcpDiffContentItem {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    record.type === 'diff' && typeof record.path === 'string' && typeof record.newText === 'string'
  );
}

function toolCallValue(
  toolRequest: ToolRequestMessageContent
): { name: string; arguments?: Record<string, unknown> } | null {
  const toolCall = toolRequest.toolCall as Record<string, unknown>;
  const value =
    toolCall?.status === 'success' ? (toolCall.value as Record<string, unknown>) : toolCall;
  if (!value || typeof value.name !== 'string') return null;
  return value as { name: string; arguments?: Record<string, unknown> };
}

function locationsPath(metadata: Record<string, unknown> | undefined): string | undefined {
  const locations = metadata?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return undefined;
  const first = locations[0] as { path?: unknown } | undefined;
  return typeof first?.path === 'string' ? first.path : undefined;
}

function resolvePath(
  diffPath: string | undefined,
  requestMeta: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): string | undefined {
  if (diffPath) return diffPath;
  const fromLocations = locationsPath(requestMeta);
  if (fromLocations) return fromLocations;
  if (typeof args.file_path === 'string') return args.file_path;
  if (typeof args.path === 'string') return args.path;
  return undefined;
}

// goose's ACP provider flattens an ACP diff item into one text block,
// `--- <path>\n<old>\n+++ <path>\n<new>` (`acp/provider.rs` acp_tool_call_content_to_rmcp).
const FLATTENED_DIFF = /^--- (.+)\n([\s\S]*?)\n?\+\+\+ \1\n([\s\S]*)$/;

function responseTexts(toolResponse: ToolResponseMessageContent | undefined): string[] {
  const result = toolResponse?.toolResult as Record<string, unknown> | undefined;
  const value = result?.status === 'success' ? (result.value as Record<string, unknown>) : result;
  const content = value?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as { text?: unknown }).text === 'string'
      ? [(item as { text: string }).text]
      : []
  );
}

// The desktop never sees `goose.acp.kind` (the server sends ToolKind::default(),
// `acp/server/tool_calls/conversion.rs`), so the text's shape — one path on both headers — is
// the signal.
function flattenedDiff(toolResponse: ToolResponseMessageContent | undefined): TurnDiff | null {
  for (const text of responseTexts(toolResponse)) {
    const match = FLATTENED_DIFF.exec(text);
    if (match) {
      const [, path, oldText, newText] = match;
      return { path, oldText, newText, kind: oldText ? 'edit' : 'write' };
    }
  }
  return null;
}

export function turnDiffFromToolCall(
  toolRequest: ToolRequestMessageContent,
  toolResponse?: ToolResponseMessageContent
): TurnDiff | null {
  const value = toolCallValue(toolRequest);
  if (!value) return null;
  const args = value.arguments ?? {};
  const requestMeta = toolRequest.metadata as Record<string, unknown> | undefined;
  const responseMeta = toolResponse?.metadata as Record<string, unknown> | undefined;
  const responseContent = responseMeta?.content;

  const flattened = flattenedDiff(toolResponse);
  if (flattened) return flattened;

  if (Array.isArray(responseContent)) {
    const diffItem = responseContent.find(isAcpDiffContentItem);
    if (diffItem) {
      const path = resolvePath(diffItem.path, requestMeta, args);
      if (path) {
        return {
          path,
          oldText: diffItem.oldText ?? '',
          newText: diffItem.newText,
          kind: diffItem.oldText != null ? 'edit' : 'write',
        };
      }
    }
  }

  if (typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    const path = resolvePath(undefined, requestMeta, args);
    if (path) {
      return { path, oldText: args.old_string, newText: args.new_string, kind: 'edit' };
    }
  }

  if (typeof args.content === 'string' && typeof args.old_string !== 'string') {
    const path = resolvePath(undefined, requestMeta, args);
    if (path) {
      return { path, oldText: '', newText: args.content, kind: 'write' };
    }
  }

  if (value.name.endsWith('text_editor')) {
    if (
      args.command === 'str_replace' &&
      typeof args.old_str === 'string' &&
      typeof args.new_str === 'string'
    ) {
      const path = resolvePath(undefined, requestMeta, args);
      if (path) {
        return { path, oldText: args.old_str, newText: args.new_str, kind: 'edit' };
      }
    }
    if (args.command === 'write' && typeof args.file_text === 'string') {
      const path = resolvePath(undefined, requestMeta, args);
      if (path) {
        return { path, oldText: '', newText: args.file_text, kind: 'write' };
      }
    }
  }

  return null;
}

// Changes lists paths relative to the repo; an adapter reports absolute ones, and on macOS the
// same temp dir reads as /var/… or /private/var/….
export function repoRelative(path: string, toplevel: string): string {
  const strip = (p: string) => p.replace(/^\/private(?=\/)/, '');
  const root = strip(toplevel).replace(/\/+$/, '');
  const target = strip(path);
  return root && target.startsWith(`${root}/`) ? target.slice(root.length + 1) : path;
}
