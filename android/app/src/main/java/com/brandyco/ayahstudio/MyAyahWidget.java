package com.brandyco.ayahstudio;

/** Home-screen widget "My ayah" (owner request 2026-11-24): the user's own ayah of the day, which the app picks
 *  from what they memorise and read (src/data/myAyah.ts) and hands over for the next two weeks. Everything else,
 *  including the large size showing both ayat side by side, is DailyAyahWidget's. */
public class MyAyahWidget extends DailyAyahWidget {
    @Override
    boolean mine() { return true; }
}
