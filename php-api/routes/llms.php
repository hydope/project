<?php
// llms.txt — serves the CURATED static file, nothing generated.
//
// The curated content lives in public/llms.txt, generated at build time by
// scripts/build-llms-txt.mjs from src/data/routeSeo.js (About → Services →
// Key pages → Contact, with the brand's accuracy discipline: no member
// counts, no testimonials, no blanket "Verified" claims).
//
// This route used to GENERATE a link dump from the live database on every
// request (2026-11-15, G3 — retired). That output claimed all members were
// "Verified Shia brides and grooms" (the site's own position: members are
// email-verified; ID verification is an optional badge), linked a
// /success-stories/ page the accuracy policy says does not exist, listed
// duplicate UK country pages with conflicting counts, and published raw
// member-location strings ("Kapk", "Other") as places. The public
// /llms.txt URL is now served the static file directly by Apache; this
// route remains only so a direct /api/llms.txt request returns the same
// curated content instead of the retired generator's output.
//
// GET /api/llms.txt (fallback; public /llms.txt is the static file)
declare(strict_types=1);

function llmsTxt(): void
{
    // Deployed layout: this file is public_html/api/routes/llms.php and the
    // curated file is public_html/llms.txt (two levels up). Repo layout
    // (local dev): php-api/routes/llms.php, curated file at public/llms.txt.
    $candidates = [
        dirname(__DIR__, 2) . '/llms.txt',
        dirname(__DIR__, 2) . '/public/llms.txt',
    ];
    foreach ($candidates as $path) {
        if (is_readable($path)) {
            $body = file_get_contents($path);
            if ($body !== false && trim($body) !== '') {
                header('Content-Type: text/plain; charset=UTF-8');
                header('Cache-Control: public, max-age=3600');
                echo $body;
                exit;
            }
        }
    }

    // Curated file unreadable — serve a minimal static fallback with the
    // same accuracy discipline (no counts, no testimonials, no blanket
    // verification claim). This text mirrors public/llms.txt's About and
    // Contact; if it ever has to change, change the curated file first.
    $fallback = <<<'TXT'
# Shia Rishta

> Shia matrimony and nikah platform. Browse Shia brides and grooms, keep photos
> private by default, involve family through wali and guardian workflows, and talk
> only after mutual interest. Free to join.

## About

Shia Rishta is a matchmaking platform for Shia Muslims seeking nikah (Islamic
marriage), and for the families, parents, walis and matchmakers who support them.
Based in Hyderabad, India, serving Shia families worldwide. Every profile is
created with marriage intent. Members are email-verified; identity verification
is an optional badge, never a precondition for browsing. There is no payment
system and no paid tier: creating a profile, browsing, expressing interest,
messaging a match and all guardian tools are free.

## Contact

- General enquiries, privacy requests, takedown requests and safety reports:
  https://shiarishta.com/contact
- Base: Hyderabad, India
TXT;

    header('Content-Type: text/plain; charset=UTF-8');
    header('Cache-Control: public, max-age=3600');
    echo $fallback;
    exit;
}
