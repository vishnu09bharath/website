export const profile = {
  name: "Vishnu Bharath",
  tagline: "robotics / research / ventures",
  email: "mr.vishnubharath@gmail.com",
  links: [
    { label: "email", href: "mailto:mr.vishnubharath@gmail.com" },
    { label: "linkedin", href: "https://www.linkedin.com/in/vishnubharath" },
    { label: "github", href: "https://github.com/" }
  ]
};

export const navItems = [
  { label: "work", href: "#work" },
  { label: "research", href: "#research" },
  { label: "projects", href: "#projects" },
  { label: "about", href: "#about" }
];

export const sections = [
  {
    id: "work",
    title: "work",
    kicker: "current / past",
    entries: [
      {
        title: "MIT Media Lab, City Science Group",
        meta: "Research Intern",
        text: "Add a short paragraph about your robotics research, what you built, and what kind of problems you want to keep working on."
      },
      {
        title: "FIRST Robotics Competition",
        meta: "Founder, Captain, Business and Programming Lead",
        text: "Add the version of this story you want people to remember: team origin, technical leadership, fundraising, outreach, and competition results."
      },
      {
        title: "NEIA School Store",
        meta: "CEO, formerly CTO",
        text: "Add the business story: revenue, operations, product decisions, team leadership, and what you learned."
      }
    ]
  },
  {
    id: "research",
    title: "research",
    kicker: "papers / prototypes",
    entries: [
      {
        title: "Expressive Robotic Body Language",
        meta: "Expected HRI '26",
        text: "Add the abstract-length summary here, including collaborators, venue, and the core research question."
      },
      {
        title: "Robot Navigation and Control",
        meta: "ROS / SLAM / controls",
        text: "Add a compact technical summary of your control stack, navigation experiments, and systems work."
      }
    ]
  },
  {
    id: "projects",
    title: "projects",
    kicker: "selected",
    entries: [
      {
        title: "Pristiq",
        meta: "venture concept",
        text: "Add the pitch, product thesis, and outcome."
      },
      {
        title: "Gear Grease",
        meta: "AI game concept",
        text: "Add the sustainability game concept, LLM/NLP angle, and MIT Day of AI presentation details."
      }
    ]
  },
  {
    id: "about",
    title: "about",
    kicker: "bio / contact",
    entries: [
      {
        title: "Short bio",
        meta: "Massachusetts",
        text: "Write this in your own voice. Keep it direct: what you build, what you care about, and what you are looking for next."
      },
      {
        title: "Interests",
        meta: "outside the lab",
        text: "Add the parts of your personality you want on the site: fencing, volunteering, motorsports, politics, languages, or anything else."
      }
    ]
  }
];
