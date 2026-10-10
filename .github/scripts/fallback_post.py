#!/usr/bin/env python3
"""Fallback template post when NVIDIA generation fails. Takes the topic JSON
file (same shape as build_prompt.py input) and prints {"post": {...}}.
Kept deliberately simple and deterministic so a bad model day can never
empty the queue."""
import json
import sys

with open(sys.argv[1]) as f:
    topic = json.load(f)["topic"]

title = (topic.get("topic") or "Marriage Guidance")[:160]
keyword = topic.get("keyword") or "shia matrimony"
category = topic.get("category") or "Guidance"

post = {
    "title": title,
    "excerpt": f"Guidance on {keyword} for Shia Muslims seeking nikah."[:300],
    "category": category,
    "readTime": "5 min",
    "body": [
        {"t": "p", "x": f"In the journey toward nikah, understanding {keyword} is essential for Shia Muslims. This guidance draws on Islamic principles and practical wisdom."},
        {"t": "h2", "x": "Islamic Perspective"},
        {"t": "p", "x": "The Quran and Ahlul Bayt (as) provide clear guidance on marriage. Approaching this with sincerity, patience, and trust in Allah leads to blessed outcomes."},
        {"t": "h2", "x": "Practical Steps"},
        {"t": "p", "x": "Begin with clear intention, involve family and wali where appropriate, and prioritize deen and character in your search. Take time to know a potential spouse through halal means."},
        {"t": "p", "x": "May Allah bless your search with a righteous spouse and a fulfilling marriage. Ameen."},
    ],
}
print(json.dumps({"post": post}))
