/**
 * Seed Ngân hàng câu hỏi + Đề luyện tập cho các Khoá học đã có trong DB.
 *
 * Script tạo, cho mỗi khoá khớp pack:
 *   - `course_difficulty_levels`  — thang độ khó (Nhận biết → Vận dụng cao)
 *   - `modules`                   — chuyên đề
 *   - `questions`                 — câu hỏi trắc nghiệm + tự luận (HTML TipTap, LaTeX `$…$`)
 *   - `lessons` (kind = practice) — đề luyện tập / đề kiểm tra
 *   - `question_links`            — câu hỏi thuộc từng đề, kèm `order`
 *
 * Script KHÔNG đụng tới lớp, học sinh, `class_content_items` hay `attempts`.
 *
 * Tính idempotent: mọi bản ghi dùng UUID **tất định** sinh từ
 * `sha1(namespace + courseId + kind + key)` nên chạy lại chỉ cập nhật, không nhân bản.
 *
 * Cách dùng (chạy từ `apps/api`):
 *   pnpm seed:question-bank                       # dry-run, in ra kế hoạch
 *   pnpm seed:question-bank --apply               # ghi vào DB
 *   pnpm seed:question-bank --apply --course=VIP  # chỉ một khoá (tên hoặc id)
 *   pnpm seed:question-bank --apply --pack=algorithms
 *   pnpm seed:question-bank --apply --reset       # xoá dữ liệu do seed tạo rồi seed lại
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { algorithmsPack } from './seed-data/algorithms';
import { mathThptPack } from './seed-data/math-thpt';
import type { SeedExam, SeedPack, SeedQuestion } from './seed-data/types';

const PACKS: SeedPack[] = [algorithmsPack, mathThptPack];

/** Namespace cố định — đổi giá trị này sẽ sinh ra bộ id hoàn toàn mới. */
const SEED_NAMESPACE = 'unicorns-edu:question-bank-seed:v1';

const rawDatabaseUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!rawDatabaseUrl) {
  throw new Error('DATABASE_URL (hoặc DIRECT_URL) là bắt buộc.');
}
const databaseUrl: string = rawDatabaseUrl;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tham số dòng lệnh
// ─────────────────────────────────────────────────────────────────────────────

interface CliOptions {
  apply: boolean;
  reset: boolean;
  courses: string[];
  packs: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, reset: false, courses: [], packs: [] };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--reset') options.reset = true;
    else if (arg.startsWith('--course=')) options.courses.push(arg.slice(9).trim());
    else if (arg.startsWith('--pack=')) options.packs.push(arg.slice(7).trim());
    else if (arg === '--dry-run') options.apply = false;
    else throw new Error(`Tham số không hợp lệ: ${arg}`);
  }
  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// UUID tất định — cùng đầu vào luôn cho cùng id, nên seed chạy lại là upsert
// ─────────────────────────────────────────────────────────────────────────────

function deterministicUuid(...parts: string[]): string {
  const hash = createHash('sha1')
    .update([SEED_NAMESPACE, ...parts].join('|'))
    .digest('hex');
  // Ép về định dạng UUID v5 (version 5, variant RFC 4122).
  const version = '5';
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    version + hash.slice(13, 16),
    variant + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ─────────────────────────────────────────────────────────────────────────────
// Chọn câu hỏi cho một đề theo blueprint độ khó
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lấy câu hỏi cho một đề: với mỗi độ khó trong blueprint, chọn đúng số câu yêu
 * cầu từ nguồn đã lọc theo chuyên đề.
 *
 * Chiến lược hiện tại là **tất định và trải đều chuyên đề**: nhóm theo độ khó, sắp
 * xếp theo `key`, rồi rải vòng tròn (round-robin) qua các chuyên đề để một đề tổng
 * hợp không dồn hết câu vào chuyên đề đầu. `exam.rotate` xoay vòng danh sách đó
 * trước khi cắt, để hai đề cùng blueprint trên cùng pool không ra trùng câu.
 * Đổi hàm này nếu muốn tỉ lệ khác — ví dụ ưu tiên chuyên đề gần cuối khoá, hoặc
 * chọn ngẫu nhiên có seed.
 */
function pickExamQuestions(pool: SeedQuestion[], exam: SeedExam): SeedQuestion[] {
  const moduleSet = exam.modules ? new Set(exam.modules) : null;
  const scoped = moduleSet ? pool.filter((q) => moduleSet.has(q.module)) : pool;

  const picked: SeedQuestion[] = [];

  for (const [difficulty, count] of Object.entries(exam.blueprint)) {
    const candidates = scoped
      .filter((q) => q.difficulty === difficulty)
      .sort((a, b) => a.key.localeCompare(b.key));

    // Gom theo chuyên đề rồi rải vòng tròn để câu hỏi trải đều các chuyên đề.
    const byModule = new Map<string, SeedQuestion[]>();
    for (const q of candidates) {
      const bucket = byModule.get(q.module) ?? [];
      bucket.push(q);
      byModule.set(q.module, bucket);
    }
    const buckets = [...byModule.values()];
    const roundRobin: SeedQuestion[] = [];
    for (let i = 0; roundRobin.length < candidates.length; i++) {
      for (const bucket of buckets) {
        if (i < bucket.length) roundRobin.push(bucket[i]);
      }
    }

    if (roundRobin.length < count) {
      console.warn(
        `  ⚠ Đề "${exam.title}": cần ${count} câu "${difficulty}" nhưng chỉ có ${roundRobin.length}.`,
      );
    }

    // Xoay vòng để các đề dùng chung pool không lấy trùng câu. `rotate` là hệ
    // số: offset thực = rotate × count, nên đề `rotate: 1` lấy đúng khối kế
    // tiếp của đề `rotate: 0` ở *mọi* mức độ khó, dù mỗi mức có pool khác nhau.
    const shift = (exam.rotate ?? 0) * count;
    const offset = roundRobin.length
      ? ((shift % roundRobin.length) + roundRobin.length) % roundRobin.length
      : 0;
    const rotated = [...roundRobin.slice(offset), ...roundRobin.slice(0, offset)];

    picked.push(...rotated.slice(0, count));
  }

  return picked;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed một pack vào một khoá
// ─────────────────────────────────────────────────────────────────────────────

interface SeedStats {
  difficultyLevels: number;
  modules: number;
  questions: number;
  exams: number;
  links: number;
}

async function seedPackIntoCourse(
  pack: SeedPack,
  course: { id: string; name: string },
  apply: boolean,
): Promise<SeedStats> {
  const stats: SeedStats = {
    difficultyLevels: 0,
    modules: 0,
    questions: 0,
    exams: 0,
    links: 0,
  };

  // 1. Thang độ khó — có unique(courseId, name) nên upsert thẳng theo khoá tự nhiên.
  const difficultyIdByName = new Map<string, string>();
  for (const [index, name] of pack.difficultyLevels.entries()) {
    const id = deterministicUuid(course.id, 'difficulty', name);
    if (apply) {
      const row = await prisma.courseDifficultyLevel.upsert({
        where: { courseId_name: { courseId: course.id, name } },
        create: { id, courseId: course.id, name, sortOrder: index, isActive: true },
        update: { sortOrder: index, isActive: true },
      });
      difficultyIdByName.set(name, row.id);
    } else {
      difficultyIdByName.set(name, id);
    }
    stats.difficultyLevels++;
  }

  // 2. Chuyên đề — không có unique nghiệp vụ, nên dò theo tiêu đề (bỏ qua hoa/thường)
  //    để không tạo trùng với chuyên đề do người dùng đã nhập tay.
  const moduleIdByTitle = new Map<string, string>();
  for (const [index, title] of pack.modules.entries()) {
    const fallbackId = deterministicUuid(course.id, 'chapter', title); // salt giữ 'chapter' để id seed không đổi sau rename bảng
    if (apply) {
      const existing = await prisma.module.findFirst({
        where: { courseId: course.id, title: { equals: title, mode: 'insensitive' } },
        select: { id: true },
      });
      const row = existing
        ? await prisma.module.update({
            where: { id: existing.id },
            data: { title, sortOrder: index },
          })
        : await prisma.module.create({
            data: { id: fallbackId, courseId: course.id, title, sortOrder: index },
          });
      moduleIdByTitle.set(title, row.id);
    } else {
      moduleIdByTitle.set(title, fallbackId);
    }
    stats.modules++;
  }

  // 3. Câu hỏi.
  const questionIdByKey = new Map<string, string>();
  for (const question of pack.questions) {
    const moduleId = moduleIdByTitle.get(question.module);
    const difficultyLevelId = difficultyIdByName.get(question.difficulty);
    if (!moduleId) throw new Error(`Chuyên đề không khai báo: "${question.module}"`);
    if (!difficultyLevelId)
      throw new Error(`Độ khó không khai báo: "${question.difficulty}"`);

    const id = deterministicUuid(course.id, 'question', question.key);
    questionIdByKey.set(question.key, id);

    if (apply) {
      const data = {
        courseId: course.id,
        moduleId,
        difficultyLevelId,
        type: question.type,
        content: question.content,
        options: question.options ?? undefined,
        correctIndex: question.correctIndex ?? null,
        explanation: question.explanation ?? null,
        answerGuide: question.answerGuide ?? null,
        deletedAt: null,
      };
      await prisma.question.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }
    stats.questions++;
  }

  // 4. Đề luyện tập (Lesson kind = practice) + liên kết câu hỏi.
  for (const [index, exam] of pack.exams.entries()) {
    const lessonId = deterministicUuid(course.id, 'topic', exam.key);
    // CHECK constraint `lessons_owner_check`: tiết cấp khoá bắt buộc có module_id.
    if (!exam.module) {
      throw new Error(
        `Đề "${exam.title}" thiếu \`module\` — tiết cấp khoá phải thuộc một chuyên đề.`,
      );
    }
    const moduleId = moduleIdByTitle.get(exam.module);
    if (!moduleId) throw new Error(`Chuyên đề không khai báo: "${exam.module}"`);
    const selected = pickExamQuestions(pack.questions, exam);

    if (apply) {
      const data = {
        kind: 'practice' as const,
        courseId: course.id,
        moduleId,
        classId: null,
        title: exam.title,
        order: index,
      };
      await prisma.lesson.upsert({
        where: { id: lessonId },
        create: { id: lessonId, ...data },
        update: data,
      });

      // Bỏ các liên kết cũ không còn trong đề, tránh đề phình sau khi đổi blueprint.
      const keepIds = selected.map((q) => questionIdByKey.get(q.key)!);
      await prisma.questionLink.deleteMany({
        where: { lessonId, questionId: { notIn: keepIds } },
      });

      for (const [order, question] of selected.entries()) {
        const questionId = questionIdByKey.get(question.key)!;
        await prisma.questionLink.upsert({
          where: { lessonId_questionId: { lessonId, questionId } },
          create: {
            id: deterministicUuid(course.id, 'link', exam.key, question.key),
            lessonId,
            questionId,
            order,
            points: 1,
          },
          update: { order, points: 1 },
        });
      }
    }

    stats.exams++;
    stats.links += selected.length;
    console.log(`  • Đề "${exam.title}" — ${selected.length} câu`);
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Xoá dữ liệu do seed tạo (chỉ các id tất định — không đụng dữ liệu người dùng)
// ─────────────────────────────────────────────────────────────────────────────

async function resetPackInCourse(pack: SeedPack, course: { id: string; name: string }) {
  const lessonIds = pack.exams.map((e) => deterministicUuid(course.id, 'topic', e.key));
  const questionIds = pack.questions.map((q) =>
    deterministicUuid(course.id, 'question', q.key),
  );

  await prisma.questionLink.deleteMany({ where: { lessonId: { in: lessonIds } } });
  await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });

  // `attempt_answers` / `lesson_quizzes` dùng onDelete: Restrict nên câu hỏi đã
  // được làm bài không xoá cứng được — chuyển sang xoá mềm cho các câu đó.
  const blocked = await prisma.question.findMany({
    where: {
      id: { in: questionIds },
      OR: [
        { attemptAnswers: { some: {} } },
        { lessonQuizzes: { some: {} } },
        { lessonQuizAnswers: { some: {} } },
      ],
    },
    select: { id: true },
  });
  const blockedIds = new Set(blocked.map((q) => q.id));

  if (blockedIds.size > 0) {
    await prisma.question.updateMany({
      where: { id: { in: [...blockedIds] } },
      data: { deletedAt: new Date() },
    });
    console.log(
      `  ↺ ${blockedIds.size} câu đã có bài làm → xoá mềm thay vì xoá cứng.`,
    );
  }

  const deletable = questionIds.filter((id) => !blockedIds.has(id));
  const removed = await prisma.question.deleteMany({ where: { id: { in: deletable } } });
  console.log(`  ↺ Đã xoá ${removed.count} câu hỏi seed của khoá "${course.name}".`);
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const selectedPacks = options.packs.length
    ? PACKS.filter((p) => options.packs.includes(p.key))
    : PACKS;
  if (selectedPacks.length === 0) {
    throw new Error(
      `Không có pack nào khớp. Pack hợp lệ: ${PACKS.map((p) => p.key).join(', ')}`,
    );
  }

  const courses = await prisma.course.findMany({
    select: { id: true, name: true, isActive: true },
  });

  console.log(
    options.apply
      ? '▶ Chế độ GHI DỮ LIỆU (--apply)'
      : '▶ Chế độ DRY-RUN — không ghi gì. Thêm --apply để ghi vào DB.',
  );
  console.log(`  DB: ${databaseUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@')}\n`);

  const total: SeedStats = {
    difficultyLevels: 0,
    modules: 0,
    questions: 0,
    exams: 0,
    links: 0,
  };

  for (const pack of selectedPacks) {
    const targets = courses.filter((course) => {
      const matchesPack = pack.courseNames.some(
        (name) => name.toLowerCase() === course.name.trim().toLowerCase(),
      );
      if (!matchesPack) return false;
      if (options.courses.length === 0) return true;
      return options.courses.some(
        (filter) =>
          filter === course.id || filter.toLowerCase() === course.name.trim().toLowerCase(),
      );
    });

    if (targets.length === 0) {
      console.log(`Pack "${pack.key}": không có khoá nào khớp — bỏ qua.\n`);
      continue;
    }

    for (const course of targets) {
      console.log(`Pack "${pack.key}" → Khoá "${course.name}" (${course.id})`);

      if (options.reset && options.apply) {
        await resetPackInCourse(pack, course);
      }

      const stats = await seedPackIntoCourse(pack, course, options.apply);
      total.difficultyLevels += stats.difficultyLevels;
      total.modules += stats.modules;
      total.questions += stats.questions;
      total.exams += stats.exams;
      total.links += stats.links;
      console.log('');
    }
  }

  console.log('── Tổng kết ─────────────────────────────');
  console.log(`  Độ khó      : ${total.difficultyLevels}`);
  console.log(`  Chuyên đề   : ${total.modules}`);
  console.log(`  Câu hỏi     : ${total.questions}`);
  console.log(`  Đề          : ${total.exams}`);
  console.log(`  Liên kết câu: ${total.links}`);
  if (!options.apply) {
    console.log('\n  (dry-run — chưa ghi gì. Chạy lại kèm --apply để ghi.)');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
