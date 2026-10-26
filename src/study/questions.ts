// Start-screen content. The information text is still marked work in
// progress, and the consent statements are placeholders: replace both with
// the ethics-approved versions before running the study. Question ids are what end up in the submitted profile.

export interface ProfileQuestion {
  id: string;
  label: string;
  type: "select" | "text";
  options?: string[];
  required: boolean;
}

export const STUDY_TITLE = "Sketching articulated objects";

/** `**text**` is shown in bold. */
export const INFORMATION_PARAGRAPHS = [
  "[work in progress]",
  "The goal of this study is to better understand the design process behind 3D sketching. The 3D sketch objects this study is interested in are descriptions of **articulated objects**, where sketches are naturally segmented into parts, and joints describe the movement between each part. We are interested in how you will sketch a reference articulated object, designing and describing joints between the sketch parts you create.",
  "You may sketch as many models as you like, and take as long as you need. The work is saved in the browser, so you can close the page and come back later. You are not expected to be good at drawing or art in general, nor are you expected to spend a very long time on each model to refine details.",
  "We record your sketches and how you use the tool, keeping a log of your progress. We do not record video, audio, or your screen.",
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
