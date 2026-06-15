CREATE TABLE `search_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`updated_ms` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`indexed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_path_unique` ON `search_documents` (`path`);--> statement-breakpoint
CREATE TABLE `search_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`line_no` integer NOT NULL,
	`line_text` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `search_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_lines_document_id_idx` ON `search_lines` (`document_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_documents_fts` USING fts5(
  `path`,
  `title`,
  `body`,
  `document_id` UNINDEXED
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `search_lines_fts` USING fts5(
  `path`,
  `title`,
  `body`,
  `document_id` UNINDEXED,
  `line_no` UNINDEXED
);
