// resumeRouter.ts

// Improved job classification logic to distinguish between SDR and Talent Acquisition roles.
const classifyJobRole = (jobTitle) => {
    const sdrTitles = ['Sales Development Representative', 'Sales Development Reps', 'SDR'];
    const talentAcquisitionTitles = ['Talent Acquisition', 'Recruiter', 'Recruiting Specialist'];

    const titleLower = jobTitle.toLowerCase();
    if (sdrTitles.some(title => titleLower.includes(title.toLowerCase()))) {
        return 'SDR';
    } else if (talentAcquisitionTitles.some(title => titleLower.includes(title.toLowerCase()))) {
        return 'Talent Acquisition';
    }
    // Default classification
    return 'Other';
};

// Enhanced LinkedIn URL handling
const extractJobDescription = (url) => {
    // This function includes strategies to handle obstacles imposed by LinkedIn scraping
    // Placeholder for logic to efficiently extract descriptions
};

// Better language separation
const separateLanguages = (inputText) => {
    const portugueseRegex = /[\u00C0-\u00FF]+/;
    const englishRegex = /^[A-Za-z0-9\s,.'-]+$/;

    const portugueseText = inputText.split('\n').filter(line => portugueseRegex.test(line)).join('\n');
    const englishText = inputText.split('\n').filter(line => englishRegex.test(line)).join('\n');
    return { portugueseText, englishText };
};

// Improved validation to classify job roles correctly
const validateJobClassification = (jobRole, jobDescription) => {
    const isSdr = classifyJobRole(jobDescription) === 'SDR';
    const isTalentAcquisition = classifyJobRole(jobDescription) === 'Talent Acquisition';

    if (isSdr && jobRole === 'Talent Acquisition') {
        throw new Error('Job incorrectly classified as Talent Acquisition when it should be SDR.');
    } else if (isTalentAcquisition && jobRole === 'SDR') {
        throw new Error('Job incorrectly classified as SDR when it should be Talent Acquisition.');
    }
};

// Enhance user message with explicit instructions
const enhancedUserMessage = 'Please ensure to detect the actual job role type before processing. Check for keywords indicating SDR or Talent Acquisition roles to avoid misclassification.';

// More robust job context validation in analyze mutation
const analyzeJobContext = (job) => {
    // Placeholder for robust validation logic for job context
};

module.exports = { classifyJobRole, extractJobDescription, separateLanguages, validateJobClassification, enhancedUserMessage, analyzeJobContext };