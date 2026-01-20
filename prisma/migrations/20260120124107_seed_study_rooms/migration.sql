-- Seed 10 predefined study rooms
-- This migration creates 10 rooms with capacity 50 and current_occupancy 0

INSERT INTO "rooms" (id, name, capacity, current_occupancy, created_at)
VALUES
  (gen_random_uuid(), 'Study Room 1', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 2', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 3', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 4', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 5', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 6', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 7', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 8', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 9', 50, 0, NOW()),
  (gen_random_uuid(), 'Study Room 10', 50, 0, NOW());
