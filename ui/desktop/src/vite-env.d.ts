/// <reference types="vite/client" />

declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.mp3' {
  const value: string;
  export default value;
}

declare module '*.mp4' {
  const value: string;
  export default value;
}

declare module '*.md?raw' {
  const value: string;
  export default value;
}

declare global {
  interface Window {
    isCreatingRecipe?: boolean;
  }

  interface WindowEventMap {
    'add-active-session': CustomEvent<{
      sessionId: string;
      initialMessage?: string;
    }>;
    'clear-initial-message': CustomEvent<{
      sessionId: string;
    }>;
    'insert-input-text': CustomEvent<string>;
    'insert-input-image': CustomEvent<{ data: string; mimeType: string }>;
    responseStyleChanged: CustomEvent;
    'session-created': CustomEvent<{ session?: import('./types/session').Session }>;
    'session-deleted': CustomEvent<{ sessionId: string }>;
    'session-renamed': CustomEvent<{
      sessionId: string;
      newName: string;
      userInitiated?: boolean;
    }>;
  }
}

// Electron's <webview> is a custom element the renderer only sees with `webviewTag` on; the
// Browser pane types the methods it calls itself (src/workspace cannot import 'electron').
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
