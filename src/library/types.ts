export type LibraryKind = "macro" | "clicker" | "script";

export type LibraryFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
};

export type LibraryItemDto = {
  id: string;
  name: string;
  kind: string;
  folderId?: string | null;
  locked: boolean;
  enabled?: boolean;
  icon?: string | null;
  updatedAt: number;
  meta?: string | null;
  sortOrder?: number;
};

export type LibraryIndexDto = {
  folders: LibraryFolder[];
  items: LibraryItemDto[];
};

/** System virtual folders */
export type LibraryFilterId = "__all" | "__favorites" | string;

export type LibraryItemView = {
  id: string;
  name: string;
  locked: boolean;
  folderId: string | null;
  favorite: boolean;
  meta?: string;
  active?: boolean;
  dirty?: boolean;
  sortOrder?: number;
};
