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

system = (
    "Write a Shia Muslim marriage guidance article as STRICT JSON with keys: "
    "title, excerpt, category, readTime, body. "
    'Body is an array of {"t": "p" or "h2", "x": "text"} objects. '
    "No markdown fences, only the JSON object.\n"
    f'Target search query "{keyword}" naturally in title and opening. '
    "Warm, respectful tone. About 500 words, 5-8 paragraphs, one or two h2 headings. "
    "Excerpt is one sentence under 160 characters. "
    f'Category must be exactly "{category}". Do not invent statistics.\n'
    f"TOPIC: {title_topic}"
    + (f" | ANGLE: {angle}" if angle else "")
)

print(json.dumps({"system": system}))
