// Temporary, approved application imagery. Replace these assets and their
// descriptions here after the next app redesign is approved. Layout and
// responsive presentation belong to PublicHomepage, not to the image files.
export const publicApplicationPreviews = {
  dashboard: {
    src: '/images/homepage-dashboard.jpg',
    width: 1360,
    height: 820,
    alt: 'The Socrates Home dashboard with its Study action, Topic Tree, and New to Mastery sliders.',
    caption: 'Choose your Topics. Make your study plan. · Demo account',
  },
  study: {
    src: '/images/homepage-study.jpg',
    width: 1345,
    height: 829,
    alt: 'Socrates Study Mode showing an active-recall Question card.',
    caption: 'Recall first. Then reveal and reflect. · Demo content',
  },
} as const;
