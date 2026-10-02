import { Injectable } from '@nestjs/common';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { CourseAccessService } from 'src/class/course-access.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClassContentService } from './class-content.service';
import { CourseModuleService } from './course-module.service';
import { CourseLessonService } from './course-lesson.service';
import { ExamLibraryService } from './exam-library.service';
import { LessonQuizService } from './lesson-quiz.service';
import { PracticeQuestionLinkService } from './practice-question-link.service';
import { CourseContentSupportService } from './course-content-support.service';

export type { ActionHistoryActor } from './course-content-support.service';
export { CourseContentSupportService } from './course-content-support.service';

/**
 * Compat aggregator so existing unit tests and Attempt/UserProfile injectors
 * keep constructing one 3-arg service. Controllers inject the resource
 * services below; this class does not own business logic.
 */
@Injectable()
export class CourseContentService extends CourseContentSupportService {
  private readonly modules: CourseModuleService;
  private readonly lessons: CourseLessonService;
  private readonly exams: ExamLibraryService;
  private readonly quizzes: LessonQuizService;
  private readonly questions: PracticeQuestionLinkService;
  private readonly content: ClassContentService;

  constructor(
    prisma: PrismaService,
    actionHistory: ActionHistoryService,
    courseAccess: CourseAccessService,
  ) {
    super(prisma, actionHistory, courseAccess);
    this.modules = new CourseModuleService(prisma, actionHistory, courseAccess);
    this.lessons = new CourseLessonService(prisma, actionHistory, courseAccess);
    this.exams = new ExamLibraryService(
      prisma,
      actionHistory,
      courseAccess,
      this.lessons,
    );
    this.quizzes = new LessonQuizService(prisma, actionHistory, courseAccess);
    this.questions = new PracticeQuestionLinkService(
      prisma,
      actionHistory,
      courseAccess,
    );
    this.content = new ClassContentService(prisma, actionHistory, courseAccess);
  }

  createModule(...args: Parameters<CourseModuleService['createModule']>) {
    return this.modules.createModule(...args);
  }

  updateModule(...args: Parameters<CourseModuleService['updateModule']>) {
    return this.modules.updateModule(...args);
  }

  deleteModule(...args: Parameters<CourseModuleService['deleteModule']>) {
    return this.modules.deleteModule(...args);
  }

  getModulesByCourseId(
    ...args: Parameters<CourseModuleService['getModulesByCourseId']>
  ) {
    return this.modules.getModulesByCourseId(...args);
  }

  getModuleById(...args: Parameters<CourseModuleService['getModuleById']>) {
    return this.modules.getModuleById(...args);
  }

  reorderModules(
    ...args: Parameters<CourseModuleService['reorderModules']>
  ) {
    return this.modules.reorderModules(...args);
  }

  createLesson(...args: Parameters<CourseLessonService['createLesson']>) {
    return this.lessons.createLesson(...args);
  }

  updateLesson(...args: Parameters<CourseLessonService['updateLesson']>) {
    return this.lessons.updateLesson(...args);
  }

  deleteLesson(...args: Parameters<CourseLessonService['deleteLesson']>) {
    return this.lessons.deleteLesson(...args);
  }

  getLessonsByCourseId(
    ...args: Parameters<CourseLessonService['getLessonsByCourseId']>
  ) {
    return this.lessons.getLessonsByCourseId(...args);
  }

  getLessonsByClassId(
    ...args: Parameters<CourseLessonService['getLessonsByClassId']>
  ) {
    return this.lessons.getLessonsByClassId(...args);
  }

  getLessonById(...args: Parameters<CourseLessonService['getLessonById']>) {
    return this.lessons.getLessonById(...args);
  }

  getLessonsForStudent(
    ...args: Parameters<CourseLessonService['getLessonsForStudent']>
  ) {
    return this.lessons.getLessonsForStudent(...args);
  }

  reorderLessons(...args: Parameters<CourseLessonService['reorderLessons']>) {
    return this.lessons.reorderLessons(...args);
  }

  getExamLibrary(...args: Parameters<ExamLibraryService['getExamLibrary']>) {
    return this.exams.getExamLibrary(...args);
  }

  createExamLesson(...args: Parameters<ExamLibraryService['createExamLesson']>) {
    return this.exams.createExamLesson(...args);
  }

  updateExamLesson(...args: Parameters<ExamLibraryService['updateExamLesson']>) {
    return this.exams.updateExamLesson(...args);
  }

  deleteExamLesson(...args: Parameters<ExamLibraryService['deleteExamLesson']>) {
    return this.exams.deleteExamLesson(...args);
  }

  reorderExamLessons(
    ...args: Parameters<ExamLibraryService['reorderExamLessons']>
  ) {
    return this.exams.reorderExamLessons(...args);
  }

  linkQuizQuestions(...args: Parameters<LessonQuizService['linkQuizQuestions']>) {
    return this.quizzes.linkQuizQuestions(...args);
  }

  unlinkQuizQuestion(
    ...args: Parameters<LessonQuizService['unlinkQuizQuestion']>
  ) {
    return this.quizzes.unlinkQuizQuestion(...args);
  }

  getLessonQuizzes(...args: Parameters<LessonQuizService['getLessonQuizzes']>) {
    return this.quizzes.getLessonQuizzes(...args);
  }

  getLessonQuizzesForStudent(
    ...args: Parameters<LessonQuizService['getLessonQuizzesForStudent']>
  ) {
    return this.quizzes.getLessonQuizzesForStudent(...args);
  }

  submitQuizAnswers(...args: Parameters<LessonQuizService['submitQuizAnswers']>) {
    return this.quizzes.submitQuizAnswers(...args);
  }

  getQuizAnswers(...args: Parameters<LessonQuizService['getQuizAnswers']>) {
    return this.quizzes.getQuizAnswers(...args);
  }

  getQuestionsByLessonId(
    ...args: Parameters<PracticeQuestionLinkService['getQuestionsByLessonId']>
  ) {
    return this.questions.getQuestionsByLessonId(...args);
  }

  addQuestionToLesson(
    ...args: Parameters<PracticeQuestionLinkService['addQuestionToLesson']>
  ) {
    return this.questions.addQuestionToLesson(...args);
  }

  updateQuestionLink(
    ...args: Parameters<PracticeQuestionLinkService['updateQuestionLink']>
  ) {
    return this.questions.updateQuestionLink(...args);
  }

  removeQuestionFromLesson(
    ...args: Parameters<PracticeQuestionLinkService['removeQuestionFromLesson']>
  ) {
    return this.questions.removeQuestionFromLesson(...args);
  }

  reorderQuestionLinks(
    ...args: Parameters<PracticeQuestionLinkService['reorderQuestionLinks']>
  ) {
    return this.questions.reorderQuestionLinks(...args);
  }

  getQuestionLinkSummary(
    ...args: Parameters<PracticeQuestionLinkService['getQuestionLinkSummary']>
  ) {
    return this.questions.getQuestionLinkSummary(...args);
  }

  isLessonAssignedToClass(
    ...args: Parameters<PracticeQuestionLinkService['isLessonAssignedToClass']>
  ) {
    return this.questions.isLessonAssignedToClass(...args);
  }

  getLessonForStudent(
    ...args: Parameters<ClassContentService['getLessonForStudent']>
  ) {
    return this.content.getLessonForStudent(...args);
  }

  getAssignedLessonForStudent(
    ...args: Parameters<ClassContentService['getAssignedLessonForStudent']>
  ) {
    return this.content.getAssignedLessonForStudent(...args);
  }

  recordTheoryLessonViewForStudent(
    ...args: Parameters<ClassContentService['recordTheoryLessonViewForStudent']>
  ) {
    return this.content.recordTheoryLessonViewForStudent(...args);
  }

  getPracticeAssignmentForStudent(
    ...args: Parameters<ClassContentService['getPracticeAssignmentForStudent']>
  ) {
    return this.content.getPracticeAssignmentForStudent(...args);
  }

  createClassContentItem(
    ...args: Parameters<ClassContentService['createClassContentItem']>
  ) {
    return this.content.createClassContentItem(...args);
  }

  listClassContentItems(
    ...args: Parameters<ClassContentService['listClassContentItems']>
  ) {
    return this.content.listClassContentItems(...args);
  }

  getClassTheoryProgress(
    ...args: Parameters<ClassContentService['getClassTheoryProgress']>
  ) {
    return this.content.getClassTheoryProgress(...args);
  }

  reorderClassContentItems(
    ...args: Parameters<ClassContentService['reorderClassContentItems']>
  ) {
    return this.content.reorderClassContentItems(...args);
  }

  deleteClassContentItem(
    ...args: Parameters<ClassContentService['deleteClassContentItem']>
  ) {
    return this.content.deleteClassContentItem(...args);
  }

  restoreClassContentItem(
    ...args: Parameters<ClassContentService['restoreClassContentItem']>
  ) {
    return this.content.restoreClassContentItem(...args);
  }

  updateClassContentSchedule(
    ...args: Parameters<ClassContentService['updateClassContentSchedule']>
  ) {
    return this.content.updateClassContentSchedule(...args);
  }

  listClassContentForStudent(
    ...args: Parameters<ClassContentService['listClassContentForStudent']>
  ) {
    return this.content.listClassContentForStudent(...args);
  }

  listCourseLessonsForClass(
    ...args: Parameters<ClassContentService['listCourseLessonsForClass']>
  ) {
    return this.content.listCourseLessonsForClass(...args);
  }
}
