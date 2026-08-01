export type UndoCommand<T> = {
  label: string;
  undo: () => T;
  redo: () => T;
};

export function createUndoStack<T>(limit = 50) {
  const undo: UndoCommand<T>[] = [];
  const redo: UndoCommand<T>[] = [];

  return {
    push(command: UndoCommand<T>) {
      undo.push(command);
      if (undo.length > limit) undo.shift();
      redo.length = 0;
    },
    canUndo() {
      return undo.length > 0;
    },
    canRedo() {
      return redo.length > 0;
    },
    undo(): T | null {
      const command = undo.pop();
      if (!command) return null;
      const value = command.undo();
      redo.push(command);
      return value;
    },
    redo(): T | null {
      const command = redo.pop();
      if (!command) return null;
      const value = command.redo();
      undo.push(command);
      return value;
    },
    clear() {
      undo.length = 0;
      redo.length = 0;
    },
  };
}
