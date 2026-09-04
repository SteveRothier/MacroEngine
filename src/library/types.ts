export type LibraryKind = "macro" | "clicker";

export type LibraryFolder = {
  id: string;
  name: string;
  parentId?: string | null;
};

export type LibraryItemDto = {
  id: string;
  name: string;
  kind: string;
  folderId?: string | null;
  locked: boolean;
  trashed: boolean;
  updatedAt: number;
  meta?: string | null;
  sortOrder?: number;
};

export type LibraryIndexDto = {
  folders: LibraryFolder[];
  items: LibraryItemDto[];
  trash: string[];
};

/** System virtual folders */
export type LibraryFilterId = "__all" | "__favorites" | "__trash" | string;

export type LibraryItemView = {
  id: string;
  name: string;
  locked: boolean;
  folderId: string | null;
  favorite: boolean;
  trashed: boolean;
  meta?: string;
  active?: boolean;
  dirty?: boolean;
  sortOrder?: number;
};
