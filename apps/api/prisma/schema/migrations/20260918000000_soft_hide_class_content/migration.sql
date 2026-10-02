-- Soft-hide class content + timeline; Restrict FKs that would wipe attempt history.

-- class_content_items: hidden flags
ALTER TABLE "class_content_items" ADD COLUMN "hidden_at" TIMESTAMP(6) WITH TIME ZONE;
ALTER TABLE "class_content_items" ADD COLUMN "hidden_by_staff_id" TEXT;
CREATE INDEX "class_content_items_hidden_by_staff_id_idx" ON "class_content_items"("hidden_by_staff_id");
ALTER TABLE "class_content_items" ADD CONSTRAINT "class_content_items_hidden_by_staff_id_fkey" FOREIGN KEY ("hidden_by_staff_id") REFERENCES "staff_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- class_timeline_items: hidden flags
ALTER TABLE "class_timeline_items" ADD COLUMN "hidden_at" TIMESTAMP(6) WITH TIME ZONE;
ALTER TABLE "class_timeline_items" ADD COLUMN "hidden_by_staff_id" TEXT;
CREATE INDEX "class_timeline_items_hidden_by_staff_id_idx" ON "class_timeline_items"("hidden_by_staff_id");
ALTER TABLE "class_timeline_items" ADD CONSTRAINT "class_timeline_items_hidden_by_staff_id_fkey" FOREIGN KEY ("hidden_by_staff_id") REFERENCES "staff_info"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ClassContentItem.topicId: Cascade → Restrict (do not wipe lần giao / attempts when a Topic is deleted)
ALTER TABLE "class_content_items" DROP CONSTRAINT "class_content_items_topic_id_fkey";
ALTER TABLE "class_content_items" ADD CONSTRAINT "class_content_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attempt.assignmentId: Cascade → Restrict (keep graded history if a content row is ever hard-deleted)
ALTER TABLE "attempts" DROP CONSTRAINT "attempts_assignment_id_fkey";
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "class_content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
