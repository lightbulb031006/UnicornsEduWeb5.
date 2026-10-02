# Bổ sung Công nghệ & Kỹ thuật — Tính năng Video YouTube

Tài liệu này liệt kê các bổ sung cần thiết về mặt công nghệ/kỹ thuật để triển khai tính năng tích hợp YouTube Video Upload. Mục tiêu: giúp developer và khách hàng hiểu rõ những gì cần xây mới, những gì có thể tận dụng, và cách định giá phù hợp.

---

## 1. Tổng quan hiện trạng

### Đã có sẵn (tận dụng được)

| Thành phần | Chi tiết | Giá trị tận dụng |
|------------|----------|------------------|
| `googleapis` package | v171.4.0, đã cài trong `apps/api` | YouTube Data API v3 nằm trong package này — không cần cài thêm |
| `google-auth-library` | v10.6.2, đã cài | OAuth2 client cho YouTube authorization flow |
| NestJS module structure | 40 modules, pattern rõ ràng | Thêm module `video-upload/` theo convention có sẵn |
| Multer | Transitive dependency qua `@nestjs/platform-express` | File upload parsing — có thể dùng cho chunked upload |
| Prisma ORM | Đã setup, migration flow hoàn chỉnh | Thêm field vào Class/Session, tạo model VideoUploadJob |
| TanStack Query + Axios | Frontend server state management | Gọi API theo convention hiện tại |
| Class detail page | `admin/classes/[id]` có tab structure | Thêm tab "Video bài học" theo pattern có sẵn |
| Session model | Đã có `classId`, `date`, `lessonContent` | Gắn `youtubeVideoId` trực tiếp vào Session |

### Chưa có (cần xây mới)

| Thành phần | Mức độ phức tạp | Ước tính thời gian |
|------------|-----------------|---------------------|
| Queue/Worker system (Redis + BullMQ) | Cao | 1-1.5 ngày |
| Chunked upload API (nhận mảnh + gộp stream) | Trung bình-Cao | 1 ngày |
| YouTube OAuth 2.0 flow | Trung bình | 0.5-1 ngày |
| YouTube upload worker (Resumable Upload + Playlist) | Trung bình | 1 ngày |
| Frontend upload UI (Uppy/Resumable.js) | Trung bình | 1 ngày |
| Video player tab (iframe embed) | Thấp | 0.5 ngày |
| Cron cleanup job | Thấp | 0.5 ngày |
| Schema migration + DTOs | Thấp | 0.5 ngày |

---

## 2. Chi tiết bổ sung kỹ thuật

### 2.1. Queue & Worker System

**Tại sao cần:**
- Upload video 1GB lên YouTube mất 5-15 phút. Không thể block API request trong thời gian đó.
- Cần retry mechanism khi YouTube API fail (mạng chập chờn, quota exceeded, etc.).
- Cần xử lý song song nhiều upload cùng lúc.

**Công nghệ đề xuất:**
- **Redis** + **BullMQ** (Node.js) — hoặc **@nestjs/bullmq** wrapper.
- Alternative nhẹ hơn: **BullMQ với SQLite backend** (không cần Redis server riêng).

**Cần làm:**
```
# Cài đặt
pnpm --filter api add bullmq @nestjs/bullmq ioredis

# Hoặc nếu không dùng Redis:
pnpm --filter api add bullmq @nestjs/bullmq
```

**Setup Redis server trên máy Local khách hàng:**
- Windows: Download từ https://github.com/tporadowski/redis/releases
- macOS: `brew install redis && brew services start redis`
- Linux: `apt install redis-server`

**Cấu hình:**
- Thêm `REDIS_HOST`, `REDIS_PORT` vào `.env`.
- Đăng ký `BullModule` trong `app.module.ts`.
- Tạo queue `video-upload-queue` và worker processor.

**Ước tính:** 1-1.5 ngày (bao gồm setup Redis, viết worker, test retry logic).

---

### 2.2. Chunked Upload API

**Tại sao cần:**
- File 1GB không thể upload 1 lần qua HTTP — nếu mạng đứt giữa chừng, phải upload lại từ đầu.
- Chunked upload chia nhỏ file thành các mảnh 10MB, mỗi mảnh upload riêng, có thể resume.

**Cần làm:**

**Endpoint nhận chunk:**
```typescript
POST /video-upload/:uploadId/chunk
Content-Type: multipart/form-data
Body: { chunk: File, chunkIndex: number, totalChunks: number }
Response: { received: number, total: number }
```

**Logic:**
1. Nhận chunk, lưu vào `/storage/tmp/:uploadId/chunk_:index.tmp`.
2. Validate chunk index, total chunks.
3. Trả về số chunk đã nhận.

**Endpoint hoàn thành:**
```typescript
POST /video-upload/:uploadId/complete
Body: { sessionId, classId, title, totalChunks }
Response: { jobId: string, status: "merging" }
```

**Logic gộp file (stream):**
```typescript
// Không nạp 1GB vào RAM — đọc ghi tuần tự
const writeStream = fs.createWriteStream(finalPath);
for (let i = 0; i < totalChunks; i++) {
  const chunkPath = path.join(tmpDir, `chunk_${i}.tmp`);
  const readStream = fs.createReadStream(chunkPath);
  await pipeline(readStream, writeStream, { end: false });
}
writeStream.end();
```

**Ước tính:** 1 ngày (bao gồm validation, error handling, cleanup on fail).

---

### 2.3. YouTube OAuth 2.0 Flow

**Tại sao cần:**
- YouTube API yêu cầu authorization để upload video vào channel của trung tâm.
- Cần refresh token để gọi API mà không cần người dùng đăng nhập lại.

**Cần làm:**

**Bước 1: Google Cloud Console setup**
- Tạo project tại https://console.cloud.google.com/.
- Enable YouTube Data API v3.
- Tạo OAuth 2.0 Client ID (Web application).
- Cấu hình redirect URI: `http://localhost:3000/admin/settings/youtube-callback`.

**Bước 2: Backend OAuth flow**
```typescript
// GET /admin/settings/youtube-auth — redirect user to Google
// GET /admin/settings/youtube-callback — exchange code for tokens
// Lưu refresh_token vào database (bảng system_config hoặc .env)
```

**Bước 3: Refresh token management**
```typescript
// Khi access_token hết hạn (1 giờ), dùng refresh_token để lấy access_token mới
const oauth2Client = new google.auth.OAuth2(...);
oauth2Client.setCredentials({ refresh_token: storedRefreshToken });
const { credentials } = await oauth2Client.refreshAccessToken();
```

**Lưu ý quan trọng:**
- Nếu app ở chế độ "testing", refresh token hết hạn sau 7 ngày.
- Cần submit app cho Google verification để dùng production token (quy trình 1-2 tuần).
- Alternative: dùng Service Account (không cần refresh token) nhưng cần Google Workspace.

**Ước tính:** 0.5-1 ngày (bao gồm flow, token storage, error handling).

---

### 2.4. YouTube Upload Worker

**Tại sao cần:**
- Xử lý job từ queue: upload video lên YouTube, gán vào playlist, cập nhật DB.

**Cần làm:**

**Worker logic:**
```typescript
@Processor('video-upload-queue')
export class VideoUploadProcessor {
  @Process()
  async handleUpload(job: Job<VideoUploadJobData>) {
    // 1. Invalidate cache
    await this.prisma.class.update({
      where: { id: job.data.classId },
      data: { videoSyncStatus: 'updating' }
    });

    // 2. YouTube Resumable Upload
    const youtubeVideoId = await this.youtubeService.uploadVideo({
      filePath: job.data.localFilePath,
      title: job.data.title,
      privacyStatus: 'unlisted'
    });

    // 3. Add to playlist
    await this.youtubeService.addToPlaylist({
      playlistId: classData.youtubePlaylistId,
      videoId: youtubeVideoId
    });

    // 4. Renew cache
    await this.prisma.session.update({
      where: { id: job.data.sessionId },
      data: { youtubeVideoId }
    });
    await this.prisma.class.update({
      where: { id: job.data.classId },
      data: { videoSyncStatus: 'ready' }
    });

    // 5. Cleanup
    await fs.unlink(job.data.localFilePath);
    await fs.rm(tmpDir, { recursive: true });
  }
}
```

**YouTube service:**
```typescript
async uploadVideo(params: { filePath: string, title: string, privacyStatus: string }) {
  const auth = await this.getOAuth2Client();
  const fileSize = fs.statSync(params.filePath).size;

  const res = await this.youtube.videos.insert({
    auth,
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: params.title, categoryId: '27' /* Education */ },
      status: { privacyStatus: params.privacyStatus }
    },
    media: {
      body: fs.createReadStream(params.filePath)
    }
  }, {
    // Resumable upload config
    onUploadProgress: (progress) => { /* emit progress via WebSocket */ }
  });

  return res.data.id;
}
```

**Ước tính:** 1 ngày (bao gồm error handling, retry, progress tracking).

---

### 2.5. Frontend Upload UI

**Tại sao cần:**
- Giao diện upload cho gia sư: chọn file, xem progress, auto-retry khi mạng chập chờn.

**Công nghệ đề xuất:**
- **Uppy** — thư viện upload phổ biến, hỗ trợ chunked upload, progress UI, retry.
- Alternative: **Resumable.js** — nhẹ hơn, nhưng ít feature hơn.

**Cần làm:**

**Cài đặt:**
```bash
pnpm --filter web add @uppy/core @uppy/dashboard @uppy/tus @uppy/xhr-upload
```

**Component upload:**
```typescript
'use client';
import Uppy from '@uppy/core';
import { Dashboard } from '@uppy/react';
import XHRUpload from '@uppy/xhr-upload';

const uppy = new Uppy()
  .use(XHRUpload, {
    endpoint: '/api/video-upload/:uploadId/chunk',
    chunkSize: 10 * 1024 * 1024, // 10MB
    limit: 3, // 3 concurrent uploads
    retryDelays: [0, 1000, 3000, 5000] // auto-retry
  });

export function VideoUploadForm({ classId, sessionId }) {
  return (
    <Dashboard
      uppy={uppy}
      proudlyDisplayPoweredByUppy={false}
      height={300}
    />
  );
}
```

**Progress tracking:**
- Uppy built-in progress bar.
- Optional: WebSocket push từ worker để hiển thị "Đang xử lý ngầm..." sau khi upload xong.

**Ước tính:** 1 ngày (bao gồm styling theo design tokens, error states, validation).

---

### 2.6. Video Player Tab

**Tại sao cần:**
- Hiển thị danh sách bài học + trình phát video cho học sinh.

**Cần làm:**

**Tab trong class detail page:**
```typescript
// apps/web/app/admin/classes/[id]/page.tsx
<Tabs>
  <TabsContent value="sessions">...</TabsContent>
  <TabsContent value="videos">
    <VideoLessonsList classId={classId} />
  </TabsContent>
</Tabs>
```

**Danh sách bài học:**
```typescript
export function VideoLessonsList({ classId }) {
  const { data: lessons } = useQuery({
    queryKey: ['class-lessons', classId],
    queryFn: () => fetchClassLessons(classId)
  });

  return (
    <div>
      {lessons.map(lesson => (
        <div key={lesson.id}>
          <h3>{lesson.title}</h3>
          <YouTubeEmbed videoId={lesson.youtubeVideoId} />
        </div>
      ))}
    </div>
  );
}
```

**YouTube embed:**
```typescript
export function YouTubeEmbed({ videoId }) {
  return (
    <iframe
      width="100%"
      height="400"
      src={`https://www.youtube.com/embed/${videoId}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
```

**Ước tính:** 0.5 ngày (bao gồm responsive design, loading states).

---

### 2.7. Cron Cleanup Job

**Tại sao cần:**
- Dọn file tạm khi upload fail hoặc worker crash, tránh đầy ổ cứng.

**Cần làm:**

**Setup:**
```bash
pnpm --filter api add @nestjs/schedule
```

**Job:**
```typescript
@Cron('0 2 * * *') // 2h sáng hàng ngày
async cleanupTempFiles() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Xóa file tmp cũ
  const tmpDir = '/storage/tmp';
  const files = await fs.readdir(tmpDir);
  for (const file of files) {
    const stat = await fs.stat(path.join(tmpDir, file));
    if (stat.mtime < oneDayAgo) {
      await fs.rm(path.join(tmpDir, file), { recursive: true });
    }
  }

  // Đánh dấu job tương ứng là failed
  await this.prisma.videoUploadJob.updateMany({
    where: {
      status: { in: ['pending', 'merging', 'uploading'] },
      createdAt: { lt: oneDayAgo }
    },
    data: { status: 'failed', errorMessage: 'Cleanup: file too old' }
  });
}
```

**Ước tính:** 0.5 ngày.

---

## 3. Bảng ước tính tổng hợp

| Hạng mục | Thời gian | Ghi chú |
|----------|-----------|---------|
| Schema migration + DTOs | 0.5 ngày | Thêm field, tạo model |
| Chunked upload API | 1 ngày | Nhận chunk + gộp stream |
| Queue/Worker setup (Redis + BullMQ) | 1-1.5 ngày | Bao gồm cài Redis |
| YouTube OAuth flow | 0.5-1 ngày | Token management |
| YouTube upload worker | 1 ngày | Upload + playlist + cleanup |
| Frontend upload UI | 1 ngày | Uppy + progress |
| Video player tab | 0.5 ngày | Iframe embed |
| Cron cleanup | 0.5 ngày | Dọn file tmp |
| Testing + debugging | 1 ngày | Integration test, resume test |
| **Tổng** | **6-7 ngày** | |

---

## 4. Định giá & Đề xuất

### Estimate gốc vs thực tế

| | Estimate gốc | Thực tế |
|---|--------------|---------|
| Thời gian | 3-5 ngày | 6-7 ngày |
| Chi phí | 3-5 triệu VND | 6-8 triệu VND |

### Cách đẩy giá trị tính năng lên

**Option 1: Gói cơ bản (5 triệu VND, 5 ngày)**
- Chunked upload + merge stream.
- YouTube upload worker (không có retry UI).
- Frontend upload + video player.
- Không có queue dashboard.

**Option 2: Gói đầy đủ (7-8 triệu VND, 6-7 ngày)**
- Tất cả trong gói cơ bản.
- Queue dashboard (xem job pending/processing/failed).
- Retry UI cho job failed.
- Progress tracking real-time qua WebSocket.
- Cron cleanup + disk space monitoring.

**Option 3: Gói premium (10-12 triệu VND, 8-10 ngày)**
- Tất cả trong gói đầy đủ.
- Video transcoding (nén file trước khi upload để giảm dung lượng).
- Auto-generate thumbnail từ video.
- Bulk upload (upload nhiều video cùng lúc).
- Analytics dashboard (số lượt xem, thời gian xem — cần YouTube Analytics API).

### Chi phí hạ tầng phát sinh

| Thành phần | Chi phí | Ghi chú |
|------------|---------|---------|
| Redis server | Miễn phí (Local) hoặc $10-15/tháng (cloud) | Nếu dùng máy Local khách hàng |
| YouTube API quota | Miễn phí (10,000 units/ngày) | Tăng quota cần submit request |
| Ổ cứng | Tùy dung lượng | Cần monitor disk space |

### Khuyến nghị

**Cho khách hàng ngân sách 3-5 triệu:**
- Bắt đầu với **Option 1** (gói cơ bản).
- Accept rằng YouTube quota mặc định giới hạn ~6 video/ngày.
- Không có retry UI — nếu fail, gia sư phải upload lại.
- Không có queue dashboard — admin check log để xem job status.

**Cho khách hàng sẵn sàng trả 7-8 triệu:**
- **Option 2** — đầy đủ tính năng, production-ready.
- Retry UI, progress tracking, queue dashboard.
- Đáng đồng tiền hơn vì giảm support cost sau này.

---

## 5. Rủi ro & Lưu ý

### Rủi ro kỹ thuật

1. **YouTube quota**: 10,000 units/ngày = ~6 video. Nếu khách hàng cần nhiều hơn, phải xin quota increase (1-2 tuần review).
2. **OAuth token expiry**: Nếu app ở chế độ "testing", token hết hạn sau 7 ngày. Cần submit verification.
3. **Disk space**: File 1GB tạm trên ổ cứng. Nếu ổ cứng đầy, job fail. Cần monitoring.
4. **Network stability**: Upload 1GB qua mạng văn phòng có thể mất 15-30 phút. Cần resume capability.

### Lưu ý cho developer

1. **Không dùng `googleapis` YouTube methods cũ** — một số method đã deprecated. Dùng `videos.insert()` với Resumable Upload.
2. **Stream merge** — không đọc toàn bộ file vào RAM. Dùng `fs.createReadStream()` + `pipeline()`.
3. **Error handling** — YouTube API có nhiều lỗi đặc biệt (quota exceeded, rate limit, upload timeout). Cần retry logic riêng cho từng loại.
4. **Testing** — test với file 1GB thực tế, test resume khi ngắt mạng giữa chừng.

### Lưu ý cho khách hàng

1. **YouTube ToS**: Video upload phải tuân thủ YouTube Terms of Service. Không upload nội dung vi phạm bản quyền.
2. **Privacy**: Video để chế độ "unlisted" — ai có link mới xem được. Không public.
3. **Backup**: Video trên YouTube là backup. File gốc trên máy Local bị xóa sau khi upload xong. Nếu cần backup thêm, cân nhắc giải pháp khác.
4. **Maintenance**: Redis server cần được monitor và restart nếu crash. Cron cleanup cần chạy đúng giờ.

---

## 6. Kết luận

Tính năng **khả thi** về mặt kỹ thuật, nhưng **không phải 3-5 ngày** như estimate gốc. Hệ thống hiện tại chưa có hạ tầng video/queue/YouTube, cần xây mới hoàn toàn các phần này.

**Đề xuất:**
- Ngân sách 3-5 triệu → Option 1 (cơ bản), accept một số hạn chế.
- Ngân sách 7-8 triệu → Option 2 (đầy đủ), production-ready.
- Thời gian: 6-7 ngày cho developer quen codebase.

Tài liệu này có thể gửi kèm PRD cho developer để họ báo giá chính xác hơn.
