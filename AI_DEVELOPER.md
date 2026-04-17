# AI_DEVELOPER.md

## Purpose

This document explains how AI assistants should understand and modify the EasyJob / EasyLab codebase.

It exists to help tools such as Claude, Copilot, or other AI agents safely interact with the project.

AI assistants must read this file before modifying the codebase.

---

# Project Overview

EasyJob AI is a web platform designed to help users optimize their resumes for job opportunities.

The system analyzes:

• resumes  
• job descriptions  
• skill alignment  

The platform provides:

• resume analysis  
• ATS compatibility insights  
• keyword matching  
• job description parsing  
• resume improvement suggestions  
• AI powered insights  
• PDF export

---

# High Level Architecture

The system follows a **full stack TypeScript architecture**.

Main layers:

Frontend  
React + Vite application.

Backend  
Node.js server handling APIs.

AI Layer  
Processes resume analysis and job matching.

Shared Layer  
Shared types and utilities used by both frontend and backend.

---

# Folder Overview

client/  
Frontend React application.

server/  
Backend API services.

shared/  
Shared types and logic used by both client and server.

core/  
Core logic utilities.

drizzle/  
Database schema and migrations.

patches/  
Local dependency fixes.

---

# Frontend Architecture

Location
