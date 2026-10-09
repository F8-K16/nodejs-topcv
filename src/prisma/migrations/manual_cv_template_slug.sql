-- Public CV template URLs (run on local/dev DB before prisma generate/db push)
ALTER TABLE `cv_templates`
  ADD COLUMN `slug` VARCHAR(180) NULL AFTER `name`;

UPDATE `cv_templates`
SET `slug` = CONCAT('mau-cv-', `id`)
WHERE `slug` IS NULL OR `slug` = '';

ALTER TABLE `cv_templates`
  MODIFY `slug` VARCHAR(180) NOT NULL;

ALTER TABLE `cv_templates`
  ADD UNIQUE KEY `cv_templates_slug_key` (`slug`);
