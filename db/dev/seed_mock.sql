-- Explicit LOCAL-ONLY fixtures. Never called by baseline or production startup.
INSERT INTO users(username, display_name, email, role, is_mock) VALUES
('community_admin', 'แอดมินทดสอบ', 'community-admin@example.invalid', 'ADMIN', TRUE),
('community_tester_1', 'ผู้ใช้ทดลอง 1', 'community-test-1@example.invalid', 'STUDENT', TRUE),
('community_tester_2', 'ผู้ใช้ทดลอง 2', 'community-test-2@example.invalid', 'STUDENT', TRUE),
('community_tester_3', 'ผู้ใช้ทดลอง 3', 'community-test-3@example.invalid', 'STUDENT', TRUE),
('community_tester_4', 'ผู้ใช้ทดลอง 4', 'community-test-4@example.invalid', 'STUDENT', TRUE),
('community_tester_5', 'ผู้ใช้ทดลอง 5', 'community-test-5@example.invalid', 'STUDENT', TRUE),
('community_tester_6', 'ผู้ใช้ทดลอง 6', 'community-test-6@example.invalid', 'STUDENT', TRUE)
ON CONFLICT (email) DO NOTHING;
