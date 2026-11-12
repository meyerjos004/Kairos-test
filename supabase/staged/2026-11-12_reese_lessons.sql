-- KING_LESSON (Nov 12, staged, NOT applied): 1-line lesson under each Reese trade clip (written by Claude from his transcripts around the entry).
alter table public.reese_videos add column if not exists lesson text;
update public.reese_videos set lesson = 'Shorted the 10 AM reversal off NQ''s 1H gap after the inversion, with ES''s protected high guarding the stop.' where id = 'Qm1fTcyysEw';
update public.reese_videos set lesson = 'After an 8:15 turtle soup sweep of the lows, entered on the 30s IFVG plus CISD, targeting the 1-hour FVG.' where id = 'opaiZMsMFkk';
update public.reese_videos set lesson = 'After the pre-market highs sweep, shorted toward the 1H FVG once the 5m FVG inverted near 10 AM.' where id = 'V6BszHnPr8g';
update public.reese_videos set lesson = 'With 1H bias bullish, waited for price to tap the range EQ, then went long on the 15-second CISD close.' where id = 'y18lv2Beors';
update public.reese_videos set lesson = 'Went long after price swept the lows below 9:30 and closed back above, stop at the low, target the 1H gap.' where id = '-PivY4oZ-YI';
update public.reese_videos set lesson = 'Shorted after the 30m FVG tap once a 15s FVG held with a bearish close, stop above the protected high.' where id = 'FL-RzYalzPM';
-- k_X9E-Yj3u0 (Making $15,265): no transcript file yet, no lesson.
