#!/usr/bin/env python3
"""Regenerate ECHO PWA icons from the obsidian SVG sources."""
import cairosvg

cairosvg.svg2png(url="public/icons/icon.svg", write_to="public/icons/icon-192.png",
                 output_width=192, output_height=192)
cairosvg.svg2png(url="public/icons/icon.svg", write_to="public/icons/icon-512.png",
                 output_width=512, output_height=512)
cairosvg.svg2png(url="public/icons/maskable.svg", write_to="public/icons/maskable-512.png",
                 output_width=512, output_height=512)
print("icons regenerated")
