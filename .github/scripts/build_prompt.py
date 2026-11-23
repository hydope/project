#!/usr/bin/env python3
"""Build the NVIDIA system prompt from a topic JSON file. Avoids bash quoting hell.

Rewritten 2026-11-22 (Syed's order): the old prompt asked for ~500 words with
no substance requirements, and the pipeline's template fallback filled every
failure with an identical 94-word post — 117 of them reached the blog. This
prompt demands a real, topic-specific article, and parse_post.py now rejects
anything short or templated, so a weak generation saves nothing.
"""
import json
import sys

with open(sys.argv[1]) as f:
    topic = json.load(f)["topic"]

category = topic.get("category", "Guidance")
keyword = topic.get("keyword", "")
title_topic = topic.get("topic", "")
angle = topic.get("angle", "")

example = (
    '{"title": "Finding the Right Time for Nikah", '
    '"excerpt": "Practical Islamic guidance on timing your nikah with wisdom and trust in Allah.", '
    f'"category": "{category}", "readTime": "5 min", '
    '"body": ['
    '{"t": "p", "x": "A full opening paragraph that answers the reader directly..."}, '
    '{"t": "h2", "x": "A specific section heading"}, '
    '{"t": "p", "x": "A full paragraph of specific, useful substance..."}, '
    '{"t": "ul", "x": "A concrete point\\nAnother concrete point\\nA third point"}'
    "]}"
)

system = (
    "You are an expert writer for Shia Rishta, a Shia Muslim marriage platform. "
    "Write a complete, genuinely useful article as STRICT JSON.\n"
    "The JSON object must have exactly these keys: title, excerpt, category, readTime, body.\n"
    "- title: the article headline, under 160 characters.\n"
    "- excerpt: one sentence under 160 characters.\n"
    f'- category: exactly "{category}".\n'
    '- readTime: e.g. "6 min".\n'
    "- body: an array of 12-18 blocks. Each block has exactly two keys: \"t\" and \"x\".\n"
    '  "t" is one of: "p" (paragraph), "h2" (section heading), "ul" (bullet list, items newline-separated in "x"), '
    '"ol" (numbered list, items newline-separated), "quote" (a short quotation).\n'
    "Example of the exact shape (shortened):\n"
    + example
    + "\n"
    "CONTENT RULES — an article that breaks any of these is rejected automatically:\n"
    "1. LENGTH: 900-1,100 words of body text. Short or padded articles are rejected.\n"
    "2. ANSWER THE TOPIC: the article must directly and specifically answer the question or cover the subject "
    "in the TOPIC line. Generic marriage advice that could sit under any title is rejected.\n"
    "3. PLACES: if the topic names a city or country, most of the article must be about that place's Shia "
    "community specifically — its neighbourhoods and areas, its community networks, how families there actually "
    "search, local realities (distances, housing, work, immigration where relevant). Never write a generic essay "
    "with the place name swapped in.\n"
    "4. SPECIFICS: use concrete detail — real situations, example questions, example phrases, step-by-step "
    "guidance. At most two lists and one quote per article.\n"
    "5. NO STOCK PHRASES. Never use: 'In the journey toward nikah', 'provide clear guidance on marriage', "
    "'Begin with clear intention', 'May Allah bless your search', or any similar boilerplate. Every paragraph "
    "must be written fresh for this topic; do not reuse phrasing across articles.\n"
    "6. ACCURACY: do not invent statistics, user counts, prices, addresses, or named institutions you are not "
    "sure are real. Do not fabricate hadith or Quran quotations; well-known verses and duas only. Claims about "
    "Shia Rishta are limited to: it is free, photos are private by default with member controls, wali/guardian "
    "involvement is supported, conversations start only after mutual interest.\n"
    "7. VOICE: warm, specific, respectful, never preachy. British-leaning international English. The brand name "
    "is 'Shia Rishta' (two words). Where a base location is stated, it is Hyderabad, India.\n"
    "Output rules: no markdown fences, no preamble, no commentary. Output ONLY the JSON object. "
    "Do not repeat these instructions.\n"
    f'Target the search query "{keyword}" naturally in the title and opening paragraph, then write for humans.\n'
    f"TOPIC: {title_topic}" + (f" | ANGLE: {angle}" if angle else "")
)

print(json.dumps({"system": system}))
