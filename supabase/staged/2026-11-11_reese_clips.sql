-- STAGED (not applied): Reese clips cut to just the trade. Times found from YouTube's auto-transcripts
-- (where he says he's getting in / taking the trade), so they're estimates: review before applying.
alter table public.reese_videos add column if not exists clip_start int, add column if not exists clip_end int;
update public.reese_videos v set clip_start = c.s, clip_end = c.e from (values
  ('y18lv2Beors', 60, 400),   -- Losing $5,490 In 5 Minutes: "I'm going to get in off this" @1:13
  ('k_X9E-Yj3u0', 85, 660),   -- Making $15,265 In 8 Minutes: long from last night @1:38
  ('-PivY4oZ-YI', 25, 360),   -- Making $15,125 In 4 Minutes: "take shorts back down" @0:34
  ('opaiZMsMFkk', 445, 800),  -- $3,180 In 4 Minutes (Asia): "taking my first entry" @7:39
  ('FL-RzYalzPM', 415, 575),  -- $10,770 In 3 Minutes (Asia): stop loss/entry @7:13
  ('Qm1fTcyysEw', 295, 743),  -- $11,480 In 11 Minutes: "why am I fine taking a short here" @5:09
  ('V6BszHnPr8g', 130, 560)   -- $2,850 In 2 Minutes: "taking a short" @2:22
) c(id, s, e) where v.id = c.id;
-- fix the day-based links on the 3 real trades
update public.reese_trades set video_url = 'https://youtu.be/y18lv2Beors', video_start = 60,  video_end = 400 where id = '54bc20d2-7892-4d57-9c6f-bfa3a374b005';  -- 10/21 NY long, loss (was "Making $15,265")
update public.reese_trades set video_url = 'https://youtu.be/-PivY4oZ-YI', video_start = 25,  video_end = 360 where id = '6ada7686-b3e4-40ab-9f9f-5e037a9d4077';  -- 10/15 Evening short, 8.6R win
update public.reese_trades set video_url = null, video_start = null, video_end = null where id = '30e96768-fb92-4d07-9a5a-5340ac596d5c';  -- 11/06 NY long: DZEVxR7slnM is a backtesting video, not this trade's recap
