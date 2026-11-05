import type { ClassContentItemResponseDto } from 'src/dtos/course-content.dto';
import {
  UNGROUPED_CONTENT_TITLE,
  groupClassContentByModule,
} from './class-content-groups';

function item(
  id: string,
  lessonKind: 'theory' | 'practice',
  moduleId?: string,
  over: Partial<ClassContentItemResponseDto> = {},
): ClassContentItemResponseDto {
  return {
    id,
    lessonId: `l-${id}`,
    kind: 'lesson',
    lessonKind,
    sortOrder: 0,
    title: id,
    kindLabel: lessonKind === 'theory' ? 'Tiết lý thuyết' : 'Tiết thực hành',
    source: 'course',
    moduleId,
    moduleTitle: moduleId ? `Chuyên đề ${moduleId}` : undefined,
    openAt: null,
    closeAt: null,
    durationMinutes: null,
    shuffleQuestions: true,
    isOpen: true,
    hiddenAt: null,
    hiddenByStaffId: null,
    hiddenReason: null,
    ...over,
  };
}

describe('groupClassContentByModule', () => {
  it('splits theory and practice per module, keeping input order', () => {
    const groups = groupClassContentByModule(
      [
        item('t1', 'theory', 'm1'),
        item('t2', 'theory', 'm1'),
        item('p1', 'practice', 'm1'),
        item('t3', 'theory', 'm2'),
      ],
      new Map([
        ['m2', 1],
        ['m1', 0],
      ]),
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m1', 'm2']);
    expect(groups[0].title).toBe('Chuyên đề m1');
    expect(groups[0].added).toBe(true);
    expect(groups[0].theoryItems.map((i) => i.id)).toEqual(['t1', 't2']);
    expect(groups[0].practiceItems.map((i) => i.id)).toEqual(['p1']);
    expect(groups[1].practiceItems).toEqual([]);
  });

  it('nhóm chỉ hiện khi lớp có tiết của chuyên đề', () => {
    expect(groupClassContentByModule([], new Map([['m1', 0]]))).toEqual([]);
  });

  it('item Ẩn tay vẫn thuộc nhóm', () => {
    const groups = groupClassContentByModule(
      [
        item('t1', 'theory', 'm1', {
          hiddenAt: new Date(),
          hiddenReason: 'manual',
        }),
      ],
      new Map([['m1', 0]]),
    );

    expect(groups[0].theoryItems.map((i) => i.id)).toEqual(['t1']);
  });

  it('nhóm chưa có thứ tự lớp đứng đầu', () => {
    const groups = groupClassContentByModule(
      [item('t1', 'theory', 'm1'), item('t2', 'theory', 'm-new')],
      new Map([['m1', 0]]),
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m-new', 'm1']);
  });

  it('puts items without a module in a trailing null group', () => {
    const groups = groupClassContentByModule(
      [item('p-lib', 'practice'), item('t1', 'theory', 'm1')],
      new Map([['m1', 0]]),
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m1', null]);
    expect(groups[1].title).toBe(UNGROUPED_CONTENT_TITLE);
    expect(groups[1].added).toBe(false);
    expect(groups[1].practiceItems.map((i) => i.id)).toEqual(['p-lib']);
  });
});
