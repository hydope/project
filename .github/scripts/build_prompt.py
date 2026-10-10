#!/usr/bin/env python3
"""Build the NVIDIA system prompt from a topic JSON file. Avoids bash quoting hell."""
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
    '{"t": "p", "x": "The question of when to marry weighs on many Shia Muslims..."}, '
    '{"t": "h2", "x": "What Islam Teaches About Timing"}, '
    '{"t": "p", "x": "The Ahlul Bayt (as) encouraged..."}'
    "]}"
)

system = (
    "You are a Shia Muslim marriage guidance writer. Write an article as STRICT JSON.\n"
    "The JSON object must have exactly these keys: title, excerpt, category, readTime, body.\n"
    "- title: the article headline, under 160 characters.\n"
    "- excerpt: one sentence under 160 characters.\n"
    f'- category: exactly "{category}".\n'
    '- readTime: e.g. "5 min".\n'
    '- body: an array of blocks. Each block has exactly two keys: "t" and "x".\n'
    '  The "t" value must be exactly "p" for a paragraph or exactly "h2" for a section heading. Never any other value.\n'
    '  The "x" value is the block text.\n'
    "Example of the exact shape (shortened):\n"
    + example
    + "\n"
    "Rules: no markdown fences, no preamble, no commentary. "
    "Output ONLY the JSON object. Do not repeat these instructions. "
    "Do not invent statistics or hadith references.\n"
    f'Target the search query "{keyword}" naturally in the title and opening paragraph. '
    "Warm, respectful tone. About 500 words, 5-8 paragraphs, one or two h2 headings.\n"
    f"TOPIC: {title_topic}" + (f" | ANGLE: {angle}" if angle else "")
)

print(json.dumps({"system": system}))
