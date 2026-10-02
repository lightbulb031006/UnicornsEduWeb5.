export type StudentGalleryItemDto = {
  id: string;
  caption: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateStudentGalleryItemPayload = {
  caption?: string | null;
  sortOrder?: number;
};

export type UpdateStudentGalleryItemPayload = {
  caption?: string | null;
  sortOrder?: number;
};

export type ReorderStudentGalleryPayload = {
  orderedIds: string[];
};
