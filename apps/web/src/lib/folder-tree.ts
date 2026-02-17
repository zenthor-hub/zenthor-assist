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

interface FolderTree {
  roots: FolderNode[];
  folderMap: Map<string, FolderNode>;
  notesByFolder: Map<string, FlatNote[]>;
  unfiledNotes: FlatNote[];
}

/** Build a hierarchical tree from a flat folder list + group notes by folderId. */
export function buildFolderTree(folders: FlatFolder[], notes: FlatNote[]): FolderTree {
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
  const notesByFolder = new Map<string, FlatNote[]>();
  const unfiledNotes: FlatNote[] = [];
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
