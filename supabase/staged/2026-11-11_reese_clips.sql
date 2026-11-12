-- STAGED (not applied): short Reese clips = the moment he calls the setup + takes the entry (~1-2 min), plus the result when it's right there.
-- When the clip ends KAIROS asks if they want the whole video (King, Nov 11). Times found from YouTube's auto-transcripts
-- (where he says he's getting in / taking the trade), so they're estimates: review before applying.
alter table public.reese_videos add column if not exists clip_start int, add column if not exists clip_end int;
update public.reese_videos v set clip_start = c.s, clip_end = c.e from (values
  ('y18lv2Beors', 55, 140),   -- 0:55-2:20 setup + entry + stop (loss plays out later)
  ('k_X9E-Yj3u0', 100, 225),   -- 1:40-3:45 SMT setup, entry, stop + 1:1
  ('-PivY4oZ-YI', 135, 200),   -- 2:15-3:20 entry, stop, target
  ('opaiZMsMFkk', 755, 805),  -- 12:35-13:25 the winning re-entry, stop, TP, result
  ('FL-RzYalzPM', 475, 548),  -- 7:55-9:08 trigger, entry, full TP
  ('Qm1fTcyysEw', 520, 575),  -- 8:40-9:35 why short, market entry, 1:1
  ('V6BszHnPr8g', 140, 270)   -- 2:20-4:30 why short, the inversion entry
) c(id, s, e) where v.id = c.id;
-- fix the day-based links on the 3 real trades
update public.reese_trades set video_url = 'https://youtu.be/y18lv2Beors', video_start = 55,  video_end = 140 where id = '54bc20d2-7892-4d57-9c6f-bfa3a374b005';  -- 10/21 NY long, loss (was "Making $15,265")
update public.reese_trades set video_url = 'https://youtu.be/-PivY4oZ-YI', video_start = 135,  video_end = 200 where id = '6ada7686-b3e4-40ab-9f9f-5e037a9d4077';  -- 10/15 Evening short, 8.6R win
update public.reese_trades set video_url = null, video_start = null, video_end = null where id = '30e96768-fb92-4d07-9a5a-5340ac596d5c';  -- 11/06 NY long: DZEVxR7slnM is a backtesting video, not this trade's recap
