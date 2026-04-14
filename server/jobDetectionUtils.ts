// jobDetectionUtils.ts

/**
 * Job Role Detection and Classification Utilities
 *
 * This module provides utility functions to improve accuracy in identifying
your job positions, such as Sales Development Representative (SDR) vs.
Talent Acquisition roles.
 *
 * @module jobDetectionUtils
 */

/**
 * Detects if the given job title corresponds to a Sales Development Representative (SDR).
 *
 * @param {string} title - The job title to check.
 * @returns {boolean} - Returns true if the title is an SDR, false otherwise.
 */
export function isSDR(title: string): boolean {
    const sdrKeywords = ["Sales Development Representative", "SDR", "Sales Dev Rep", "Inside Sales" ];
    return sdrKeywords.some(keyword => title.includes(keyword));
}

/**
 * Detects if the given job title corresponds to a Talent Acquisition role.
 *
 * @param {string} title - The job title to check.
 * @returns {boolean} - Returns true if the title is related to Talent Acquisition, false otherwise.
 */
export function isTalentAcquisition(title: string): boolean {
    const taKeywords = ["Talent Acquisition", "Recruiter", "Talent Recruiter", "TA Specialist", "Hiring Manager"]; 
    return taKeywords.some(keyword => title.includes(keyword));
}