interface FlatFolder {
  _id: string;
  name: string;
  color: string;
  position: number;
  parentId?: string;
}

export interface FolderNode extends FlatFolder {
  children: FolderNode[];
}

interface FlatNote {
  _id: string;
  title?: string;
  folderId?: string;
}

export interface SidebarNote extends FlatNote {
  _creationTime?: number;
  isPinned?: boolean;
  isArchived: boolean;
  deletedAt?: number;
}

export interface FolderWithDepth {
  folder: FolderNode;
  depth: number;
}

interface FolderTree<N extends FlatNote = FlatNote> {
  roots: FolderNode[];
  folderMap: Map<string, FolderNode>;
  notesByFolder: Map<string, N[]>;
  unfiledNotes: N[];
}

/** Build a hierarchical tree from a flat folder list + group notes by folderId. */
export function buildFolderTree<N extends FlatNote>(
  folders: FlatFolder[],
  notes: N[],
): FolderTree<N> {
  const folderMap = new Map<string, FolderNode>();

  // Create nodes
  for (const f of folders) {
    folderMap.set(f._id, { ...f, children: [] });
  }

  // Link children to parents
  const roots: FolderNode[] = [];
  for (const node of folderMap.values()) {
    if (node.parentId && folderMap.has(node.parentId)) {
      folderMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position at every level
  const sortByPosition = (a: FolderNode, b: FolderNode) => a.position - b.position;
  roots.sort(sortByPosition);
  for (const node of folderMap.values()) {
    node.children.sort(sortByPosition);
  }

  // Group notes by folderId
  const notesByFolder = new Map<string, N[]>();
  const unfiledNotes: N[] = [];
  for (const note of notes) {
    if (note.folderId) {
      const list = notesByFolder.get(note.folderId) ?? [];
      list.push(note);
      notesByFolder.set(note.folderId, list);
    } else {
      unfiledNotes.push(note);
    }
  }

  return { roots, folderMap, notesByFolder, unfiledNotes };
}

/** Group notes by folderId (separate from tree structure for memoization). */
export function groupNotesByFolder<N extends FlatNote>(
  notes: N[],
): { notesByFolder: Map<string, N[]>; unfiledNotes: N[] } {
  const notesByFolder = new Map<string, N[]>();
  const unfiledNotes: N[] = [];
  for (const note of notes) {
    if (note.folderId) {
      const list = notesByFolder.get(note.folderId) ?? [];
      list.push(note);
      notesByFolder.set(note.folderId, list);
    } else {
      unfiledNotes.push(note);
    }
  }
  return { notesByFolder, unfiledNotes };
}

/** Get all descendant folder IDs (for filtering out invalid move targets). */
export function getDescendantIds(
  folderMap: Map<string, FolderNode>,
  folderId: string,
): Set<string> {
  const result = new Set<string>();
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = folderMap.get(id);
    if (!node) continue;
    for (const child of node.children) {
      result.add(child._id);
      stack.push(child._id);
    }
  }
  return result;
}

/** Get ancestor path array for breadcrumb display. */
export function getFolderBreadcrumb(
  folderMap: Map<string, FolderNode>,
  folderId: string,
): string[] {
  const path: string[] = [];
  let current = folderMap.get(folderId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? folderMap.get(current.parentId) : undefined;
  }
  return path;
}

/** Flatten tree into depth-annotated list (for indented selects). */
export function flattenTreeWithDepth(
  roots: FolderNode[],
): Array<{ folder: FolderNode; depth: number }> {
  const result: Array<{ folder: FolderNode; depth: number }> = [];
  function walk(nodes: FolderNode[], depth: number) {
    for (const node of nodes) {
      result.push({ folder: node, depth });
      walk(node.children, depth + 1);
    }
  }
  walk(roots, 0);
  return result;
}
