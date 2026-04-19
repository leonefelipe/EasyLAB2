# AI_DEVELOPER.md

## Purpose

This file provides instructions for AI assistants working on the EasyJob / EasyLab repository.

Any AI system modifying this project must read this document first.

The goal is to ensure that code modifications remain safe, efficient, and consistent with the system architecture.

This repository may be edited by AI assistants such as Claude, Copilot, or other coding models.

# Product Overview

EasyJob AI is a web platform designed to help professionals improve their resumes and increase their chances of getting hired.

The platform analyzes resumes and job descriptions to generate structured insights such as:

• ATS compatibility
• skill extraction
• job match scoring
• missing keywords
• resume improvement suggestions
• optimized resume generation
• exportable professional documents

The long term goal is to evolve into a full career optimization platform.

# Core Capabilities

The system currently supports or should support the following capabilities.

Resume Analysis

The system analyzes a resume and extracts structured information including:

• skills
• experience
• education
• keywords
• resume strengths
• resume weaknesses

The system should provide actionable suggestions for improving the resume.

Job Description Parsing

The system extracts relevant information from job descriptions including:

• job title
• company name
• responsibilities
• required skills
• keywords

The extracted information should be normalized before being processed by the AI analysis engine.

Resume vs Job Matching

The platform compares a resume against a job description and generates:

• skill match score
• missing keywords
• improvement suggestions

ATS Optimization

The system evaluates resume compatibility with Applicant Tracking Systems.

It should detect:

• missing keywords
• formatting issues
• content gaps

Resume Improvement Engine

The AI engine must generate clear and practical suggestions to improve the resume.

Suggestions should always be concise and actionable.

PDF Export

The system allows users to export results and resumes as professional PDFs.

Exported documents must not contain unnecessary watermarks.

Formatting should remain consistent and professional.

# System Architecture

The project follows a modern full stack TypeScript architecture.

Frontend
React application using Vite.

Backend
Node.js server handling APIs and AI integrations.

Shared Layer
Shared types and utilities used by both frontend and backend.

AI Layer
Processes resume analysis and job matching logic.

# Folder Structure

client/

Frontend React application.

Contains UI components, layouts, and interaction logic.

server/

Backend API layer.

Handles resume parsing, job parsing, and AI processing.

shared/

Shared types and utilities used across both frontend and backend.

core/

Core utilities and processing logic.

drizzle/

Database schema and migrations.

patches/

Local dependency fixes if necessary.

# Frontend Architecture

Location

client/src

Important areas include:

components/

User interface components.

_core/

Core frontend utilities and hooks.

Key Components

AIChatBox.tsx
User interface for AI interaction.

JobLinkImporter.tsx
Input component for job links.

LinkedInJobImporter.tsx
Specialized LinkedIn job input.

DashboardLayout.tsx
Main dashboard layout.

# Backend Architecture

Location

server/

Responsibilities include:

• API endpoints
• resume analysis logic
• job description parsing
• integration with AI models
• PDF generation

# Data Flow

The application follows a predictable data pipeline.

User input
→ parsing and preprocessing
→ structured data extraction
→ AI analysis
→ structured output
→ UI rendering
→ optional export

# AI System Design

AI prompts should always follow strict design rules.

Use structured prompts whenever possible.

Prefer deterministic outputs rather than free form text.

Whenever possible, return structured JSON.

Example output format:

{
"match_score": 82,
"missing_keywords": ["Python", "Data Analysis"],
"strengths": ["Accounting", "Excel"],
"recommendations": []
}

# Token Optimization

AI calls should be optimized to reduce token consumption.

Use strategies such as:

• concise prompts
• structured outputs
• preprocessing before AI calls
• avoiding redundant analysis
• caching repeated results

Efficiency is critical for scalability.

# Code Editing Rules

AI assistants must follow strict rules when modifying this repository.

Never rewrite the entire project unless explicitly requested.

Modify only the files necessary to implement the change.

Preserve the existing architecture.

Avoid introducing unnecessary dependencies.

Ensure that existing functionality continues to work.

# Performance Principles

The system must remain fast and lightweight.

Key principles include:

• minimizing API calls
• reducing token usage
• optimizing parsing logic
• avoiding heavy dependencies
• ensuring fast UI response times

# Security Rules

All secrets must be stored in environment variables.

API keys must never be exposed in client side code.

User inputs must be validated before processing.

Sensitive user data should not be logged unnecessarily.

# LinkedIn Extraction Strategy

LinkedIn frequently blocks direct scraping.

The system should implement a resilient extraction strategy with fallback layers:

1 metadata extraction from page tags

2 rendered page extraction using headless browser

3 optional external APIs

4 manual user input fallback

All extracted information must be normalized before being processed by the analysis engine.

# PDF Export Guidelines

PDF exports should:

• contain only user content
• maintain professional formatting
• avoid unnecessary watermarks
• ensure consistent layout

# Long Term Vision

EasyJob AI should evolve toward a scalable SaaS platform with capabilities such as:

• user accounts
• saved analyses
• resume history
• job tracking
• AI career recommendations

All future changes should support this long term direction.
