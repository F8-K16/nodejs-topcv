-- Job view source analytics (run on local/dev DB)
CREATE TABLE IF NOT EXISTS `job_view_sources` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `jobId` INT NOT NULL,
  `source` VARCHAR(64) NOT NULL,
  `views` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `job_view_sources_jobId_source_key` (`jobId`, `source`),
  KEY `job_view_sources_jobId_idx` (`jobId`),
  CONSTRAINT `job_view_sources_jobId_fkey`
    FOREIGN KEY (`jobId`) REFERENCES `jobs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
