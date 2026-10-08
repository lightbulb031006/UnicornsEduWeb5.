import type { ClassContentItemResponseDto } from 'src/dtos/course-content.dto';
import {
  UNGROUPED_CONTENT_TITLE,
  groupClassContentByModule,
} from './class-content-groups';

function item(
  id: string,
  lessonKind: 'theory' | 'practice',
  moduleId?: string,
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
    openAt: null,
    durationMinutes: null,
    isOpen: true,
    hiddenAt: null,
    hiddenByStaffId: null,
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
      [
        { id: 'm2', title: 'Hai', sortOrder: 1, added: true },
        { id: 'm1', title: 'Một', sortOrder: 0, added: true },
      ],
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m1', 'm2']);
    expect(groups[0].title).toBe('Một');
    expect(groups[0].theoryItems.map((i) => i.id)).toEqual(['t1', 't2']);
    expect(groups[0].practiceItems.map((i) => i.id)).toEqual(['p1']);
    expect(groups[1].practiceItems).toEqual([]);
  });

  it('keeps added modules without items as empty groups', () => {
    const groups = groupClassContentByModule(
      [],
      [{ id: 'm1', title: 'Một', sortOrder: 0, added: true }],
    );

    expect(groups).toEqual([
      {
        moduleId: 'm1',
        title: 'Một',
        added: true,
        theoryItems: [],
        practiceItems: [],
      },
    ]);
  });

  it('drops a removed module even while it still has items', () => {
    const groups = groupClassContentByModule(
      [item('p1', 'practice', 'm-removed'), item('t1', 'theory', 'm1')],
      [
        { id: 'm-removed', title: 'Đã gỡ', sortOrder: 0, added: false },
        { id: 'm1', title: 'Một', sortOrder: 1, added: true },
      ],
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m1']);
  });

  it('puts items without a module in a trailing null group', () => {
    const groups = groupClassContentByModule(
      [item('p-lib', 'practice'), item('t1', 'theory', 'm1')],
      [{ id: 'm1', title: 'Một', sortOrder: 0, added: true }],
    );

    expect(groups.map((g) => g.moduleId)).toEqual(['m1', null]);
    expect(groups[1].title).toBe(UNGROUPED_CONTENT_TITLE);
    expect(groups[1].practiceItems.map((i) => i.id)).toEqual(['p-lib']);
  });
});
