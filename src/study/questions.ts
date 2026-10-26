// Start-screen content. PLACEHOLDER WORDING: replace the information text
// and consent statements with the ethics-approved versions before running
// the study. Question ids are what end up in the submitted profile.

export interface ProfileQuestion {
  id: string;
  label: string;
  type: "select" | "text";
  options?: string[];
  required: boolean;
}

export const STUDY_TITLE = "Sketching articulated objects";

export const INFORMATION_PARAGRAPHS = [
  "[Placeholder — replace with the approved participant information sheet.]",
  "In this study you will look at 3D models of objects with moving parts and sketch your own version of them in 3D. You will then split your sketch into parts and show how those parts move relative to each other.",
  "You can sketch as many of the models as you like and take as long as you need. Your work is saved in this browser, so you can close the page and come back later.",
  "We record your sketches and how you use the tool (which tools you use and when, and the edits you make). We do not record video, audio or your screen.",
];

export const CONSENT_STATEMENTS = [
  "I have read and understood the information above.",
  "I understand that taking part is voluntary and that I can stop at any time without giving a reason.",
  "I agree to my sketches and interaction logs being recorded, stored anonymously, and used for research and publication.",
  "I am 18 or older and agree to take part.",
];

const EXPERIENCE = ["None", "A little", "Regularly", "Professionally"];

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    id: "age",
    label: "Age range",
    type: "select",
    options: ["18–24", "25–34", "35–44", "45–54", "55–64", "65+", "Prefer not to say"],
    required: true,
  },
  {
    id: "occupation",
    label: "Occupation or field of study",
    type: "text",
    required: false,
  },
  {
    id: "experience3d",
    label: "Experience with 3D modelling software (Blender, CAD, …)",
    type: "select",
    options: EXPERIENCE,
    required: true,
  },
  {
    id: "experienceSketch",
    label: "Experience with sketching or drawing",
    type: "select",
    options: EXPERIENCE,
    required: true,
  },
  {
    id: "experienceRigging",
    label: "Experience with rigging or animating 3D models",
    type: "select",
    options: EXPERIENCE,
    required: true,
  },
  {
    id: "device",
    label: "What are you using to control the pointer?",
    type: "select",
    options: ["Mouse", "Trackpad", "Other"],
    required: true,
  },
];
