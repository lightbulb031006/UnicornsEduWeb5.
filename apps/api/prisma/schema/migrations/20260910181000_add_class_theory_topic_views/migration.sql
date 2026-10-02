-- Track student opens of theory topics assigned to a class.
CREATE TABLE "class_theory_topic_views" (
    "id" TEXT NOT NULL,
    "class_content_item_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "last_viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_theory_topic_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_theory_topic_views_class_content_item_id_student_id_key"
    ON "class_theory_topic_views"("class_content_item_id", "student_id");

CREATE INDEX "class_theory_topic_views_class_content_item_id_last_viewed_at_idx"
    ON "class_theory_topic_views"("class_content_item_id", "last_viewed_at");

CREATE INDEX "class_theory_topic_views_student_id_idx"
    ON "class_theory_topic_views"("student_id");

ALTER TABLE "class_theory_topic_views"
    ADD CONSTRAINT "class_theory_topic_views_class_content_item_id_fkey"
    FOREIGN KEY ("class_content_item_id")
    REFERENCES "class_content_items"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "class_theory_topic_views"
    ADD CONSTRAINT "class_theory_topic_views_student_id_fkey"
    FOREIGN KEY ("student_id")
    REFERENCES "student_info"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
