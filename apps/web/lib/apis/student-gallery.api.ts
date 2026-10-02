import type {
  CreateStudentGalleryItemPayload,
  ReorderStudentGalleryPayload,
  StudentGalleryItemDto,
  UpdateStudentGalleryItemPayload,
} from "@/dtos/student-gallery.dto";
import { api } from "@/lib/client";

function galleryBasePath(studentId: string) {
  return `/student/${encodeURIComponent(studentId)}/gallery`;
}

export function studentGalleryQueryKey(studentId: string) {
  return ["student-gallery", studentId] as const;
}

export async function listStudentGallery(
  studentId: string,
): Promise<StudentGalleryItemDto[]> {
  const response = await api.get<StudentGalleryItemDto[]>(
    galleryBasePath(studentId),
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function createStudentGalleryItem(
  studentId: string,
  payload: CreateStudentGalleryItemPayload,
): Promise<StudentGalleryItemDto> {
  const response = await api.post<StudentGalleryItemDto>(
    galleryBasePath(studentId),
    payload,
  );
  return response.data;
}

export async function updateStudentGalleryItem(
  studentId: string,
  itemId: string,
  payload: UpdateStudentGalleryItemPayload,
): Promise<StudentGalleryItemDto> {
  const response = await api.patch<StudentGalleryItemDto>(
    `${galleryBasePath(studentId)}/${encodeURIComponent(itemId)}`,
    payload,
  );
  return response.data;
}

export async function deleteStudentGalleryItem(
  studentId: string,
  itemId: string,
): Promise<void> {
  await api.delete(
    `${galleryBasePath(studentId)}/${encodeURIComponent(itemId)}`,
  );
}

export async function reorderStudentGallery(
  studentId: string,
  payload: ReorderStudentGalleryPayload,
): Promise<StudentGalleryItemDto[]> {
  const response = await api.put<StudentGalleryItemDto[]>(
    `${galleryBasePath(studentId)}/reorder`,
    payload,
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function uploadStudentGalleryImage(
  studentId: string,
  itemId: string,
  file: File,
): Promise<StudentGalleryItemDto> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await api.post<StudentGalleryItemDto>(
    `${galleryBasePath(studentId)}/${encodeURIComponent(itemId)}/image`,
    formData,
  );
  return response.data;
}

export async function clearStudentGalleryImage(
  studentId: string,
  itemId: string,
): Promise<StudentGalleryItemDto> {
  const response = await api.delete<StudentGalleryItemDto>(
    `${galleryBasePath(studentId)}/${encodeURIComponent(itemId)}/image`,
  );
  return response.data;
}
