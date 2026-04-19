# PROJECT_MAP.md

This document provides a minimal architecture map of the EasyJob / EasyLab codebase.

AI assistants must read this file before analyzing or modifying the repository.

The goal is to understand the system structure quickly without scanning the entire project.

# System Overview

EasyJob AI is a web platform that analyzes resumes and job descriptions in order to help users improve their CV and increase their chances of being hired.

Core features include:

• resume analysis
• job description parsing
• ATS compatibility scoring
• skill extraction
• resume improvement suggestions
• resume generation
• PDF export

# Tech Stack

Frontend
React + Vite

Backend
Node.js API server

Language
TypeScript

Testing
Vitest

Database
Drizzle ORM

# Root Files

package.json
Project dependencies and scripts.

vite.config.ts
Frontend build configuration.

vitest.config.ts
Testing configuration.

drizzle.config.ts
Database configuration.

# Frontend Structure

Location

client/src

Main entry point

App.tsx

Important folders

components/
UI components and feature modules.

components/ui/
Reusable UI components.

_core/
Core hooks and frontend utilities.

# Key Frontend Components

AIChatBox.tsx
Handles interaction with AI analysis.

JobLinkImporter.tsx
Handles job link input.

LinkedInJobImporter.tsx
Handles LinkedIn job links.

DashboardLayout.tsx
Main dashboard layout.

AnalysisLayout.tsx
Displays analysis results.

# Backend Structure

Location

server/

Responsibilities

• API endpoints
• resume analysis logic
• job description parsing
• AI integration
• PDF generation

# Core Backend Modules

resumeRouter.ts
Main router handling resume analysis.

AI analysis services
Processes resume evaluation.

Parsing services
Handles resume and job parsing.

# Shared Layer

Location

shared/

Contains shared types and utilities used across frontend and backend.

Ensures consistent data structures.

# Core Utilities

Location

core/

Reusable processing logic used across the application.

# Database

Location

drizzle/

Contains schema and database configuration.

# Data Flow

The system follows this processing pipeline:

User Input
→ preprocessing
→ parsing
→ AI analysis
→ structured result
→ UI rendering
→ optional PDF export

# LinkedIn Job Extraction

Users may provide job links from LinkedIn.

LinkedIn blocks many scraping methods.

The system should use fallback layers:

1 metadata extraction
2 rendered page extraction
3 external API if needed
4 manual job description input

# PDF Export

The platform generates professional PDF documents based on analysis results.

PDF files must not contain unwanted watermarks.

# AI Output Structure

AI responses should be structured and machine readable.

Preferred output format:

{
"match_score": 80,
"missing_keywords": [],
"skills_detected": [],
"recommendations": []
}

# Development Rules

When modifying the codebase:

• change only necessary files
• avoid rewriting the entire project
• preserve architecture
• avoid unnecessary dependencies

# Purpose of this File

This file exists to allow AI assistants to understand the repository architecture quickly and reduce token usage when analyzing the project.
