-- CreateTable
CREATE TABLE "student_gallery_items" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "caption" TEXT,
    "image_path" TEXT,
    "image_watermarked_path" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_gallery_items_student_id_sort_order_idx" ON "student_gallery_items"("student_id", "sort_order");

-- AddForeignKey
ALTER TABLE "student_gallery_items" ADD CONSTRAINT "student_gallery_items_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_info"("id") ON DELETE CASCADE ON UPDATE CASCADE;
