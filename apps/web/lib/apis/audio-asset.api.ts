import { api } from "@/lib/client";
import type {
  AudioRef,
  UpdateAudioLimitsPayload,
} from "@/dtos/audio-asset.dto";
import { audioMimeOf } from "@/lib/audio-file";

/** Tải audio tư liệu lên (asset bất biến — thay audio = tải bản mới). */
export async function uploadAudio(courseId: string, file: File): Promise<AudioRef> {
  // Trình duyệt không báo kiểu (.m4a trên Windows) → gửi kèm kiểu đoán theo đuôi.
  const type = audioMimeOf(file) ?? file.type;
  const body = type === file.type ? file : new File([file], file.name, { type });
  const formData = new FormData();
  formData.append("courseId", courseId);
  formData.append("file", body);
  const response = await api.post<AudioRef>("/audio-assets", formData);
  return response.data;
}

/** Đổi giới hạn nghe của audio (áp cho lượt làm bắt đầu sau đó lẫn lượt đang làm). */
export async function updateAudioLimits(
  id: string,
  payload: UpdateAudioLimitsPayload,
): Promise<AudioRef> {
  const response = await api.patch<AudioRef>(
    `/audio-assets/${encodeURIComponent(id)}/limits`,
    payload,
  );
  return response.data;
}
