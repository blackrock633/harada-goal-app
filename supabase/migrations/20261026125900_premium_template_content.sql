-- Premium goal templates. Starting points only; users edit everything.

insert into public.goal_templates (id, tier, name, summary, content, sort_order) values
  ('startup-launch', 'premium', 'Startup launch', 'A 12-week structure for taking a product from idea to first paying customers.', $json${
  "goalTitle": "Launch my product and sign 25 paying customers in 12 weeks",
  "vision": "I open my dashboard on a Monday and see real customers paying for something I built, with a clear picture of why they chose it and what to build next.",
  "purpose": {
    "selfTangible": "Replace part of my income with revenue from the product",
    "selfIntangible": "Confidence that I can build and sell something real",
    "othersTangible": "Give customers a tool that saves them measurable time",
    "othersIntangible": "Show the people around me that starting something is achievable"
  },
  "outcomes": [
    {
      "title": "Validated problem",
      "description": "Confirm the problem is real, painful and worth paying to solve.",
      "measure": {
        "target": 15,
        "current": 0,
        "unit": "interviews"
      },
      "actions": [
        {
          "title": "Write a one-page problem statement and target customer",
          "kind": "task"
        },
        {
          "title": "Hold customer discovery calls",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "List 10 competitors or workarounds people use today",
          "kind": "task"
        },
        {
          "title": "Summarise patterns from the first 15 interviews",
          "kind": "task"
        },
        {
          "title": "Decide go, pivot or stop against written criteria",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Focused MVP scope",
      "description": "Define the smallest product that solves the core problem.",
      "actions": [
        {
          "title": "List must-have features and cut everything else",
          "kind": "task"
        },
        {
          "title": "Sketch the main user flow on paper",
          "kind": "task"
        },
        {
          "title": "Write acceptance criteria for each must-have",
          "kind": "task"
        },
        {
          "title": "Review scope and cut anything that crept in",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        }
      ]
    },
    {
      "title": "Working product",
      "description": "Build, test and ship a usable first version.",
      "actions": [
        {
          "title": "Build for a focused block (90 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Set up hosting, error tracking and backups",
          "kind": "task"
        },
        {
          "title": "Ship a private alpha to 5 people",
          "kind": "task"
        },
        {
          "title": "Fix the top reported bugs",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Write basic onboarding and help docs",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Pricing and payments",
      "description": "Choose a price and make it simple to pay.",
      "actions": [
        {
          "title": "Test two price points in customer conversations",
          "kind": "task"
        },
        {
          "title": "Set up a payment provider and test a purchase",
          "kind": "task"
        },
        {
          "title": "Write terms of service and privacy policy",
          "kind": "task"
        },
        {
          "title": "Create a refund policy and support contact",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Audience and channels",
      "description": "Find a few channels where target customers already gather.",
      "measure": {
        "target": 200,
        "current": 0,
        "unit": "signups"
      },
      "actions": [
        {
          "title": "Pick two acquisition channels to focus on",
          "kind": "task"
        },
        {
          "title": "Share one useful post or reply in a chosen channel",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Send personal outreach messages",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 5
          }
        },
        {
          "title": "Launch a simple landing page with an email signup",
          "kind": "task"
        },
        {
          "title": "Prepare a public launch post",
          "kind": "task"
        }
      ]
    },
    {
      "title": "First paying customers",
      "description": "Convert early interest into paid accounts.",
      "measure": {
        "target": 25,
        "current": 0,
        "unit": "customers"
      },
      "actions": [
        {
          "title": "Offer a founding-customer deal to alpha users",
          "kind": "task"
        },
        {
          "title": "Run onboarding calls with new users",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Follow up with every trial that did not convert",
          "kind": "task"
        },
        {
          "title": "Ask each customer why they bought",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Collect two testimonials with permission",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Metrics and feedback",
      "description": "Track a few numbers and learn from them every week.",
      "actions": [
        {
          "title": "Choose three metrics that matter and set up tracking",
          "kind": "task"
        },
        {
          "title": "Review metrics and write a short weekly note",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Tag and review incoming feedback",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Pick the next three improvements by customer evidence",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Sustainable founder habits",
      "description": "Protect energy, money and focus through the push.",
      "actions": [
        {
          "title": "Set a monthly runway number and review date",
          "kind": "task"
        },
        {
          "title": "Plan the day's top three tasks",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Exercise or take a long walk",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Schedule one rest day per week and keep it",
          "kind": "task"
        },
        {
          "title": "Find a peer or mentor for a fortnightly check-in",
          "kind": "task"
        }
      ]
    }
  ]
}$json$::jsonb, 10),
  ('academic-performance', 'premium', 'Academic performance', 'A semester plan for building study habits and raising grades in your key subjects.', $json${
  "goalTitle": "Raise my semester GPA to 3.5 through consistent study habits",
  "vision": "I walk into exams knowing the material, because I have been working steadily all term instead of cramming, and my results reflect it.",
  "purpose": {
    "selfTangible": "Reach the grades needed for my next course or program",
    "selfIntangible": "Feel calm and capable instead of anxious before exams",
    "othersTangible": "Make good use of the support my family has given me",
    "othersIntangible": "Be a dependable study partner and example for classmates"
  },
  "outcomes": [
    {
      "title": "Reliable study routine",
      "description": "Build a weekly schedule that I can actually keep.",
      "measure": {
        "target": 10,
        "current": 0,
        "unit": "study hours/week"
      },
      "actions": [
        {
          "title": "Map classes, work and commitments into a weekly calendar",
          "kind": "task"
        },
        {
          "title": "Study in a protected block (60 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Put the phone away during study blocks",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Plan next week's study tasks",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        }
      ]
    },
    {
      "title": "Active note-taking",
      "description": "Turn lectures and reading into notes that are useful later.",
      "actions": [
        {
          "title": "Choose one note-taking method and test it for two weeks",
          "kind": "task"
        },
        {
          "title": "Rewrite or tidy notes within 24 hours of class",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 4
          }
        },
        {
          "title": "Write a one-page summary for each course",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Compare notes with a classmate once a month",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Memory and review",
      "description": "Use spaced repetition and self-testing instead of rereading.",
      "actions": [
        {
          "title": "Set up a flashcard system for each course",
          "kind": "task"
        },
        {
          "title": "Review flashcards due today (15 min)",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Do practice questions without notes",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Make a review calendar for each exam date",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Assignments on time",
      "description": "Finish coursework early enough to revise it.",
      "measure": {
        "target": 100,
        "current": 0,
        "unit": "% on time"
      },
      "actions": [
        {
          "title": "List every deadline for the term in one place",
          "kind": "task"
        },
        {
          "title": "Break each big assignment into smaller steps with dates",
          "kind": "task"
        },
        {
          "title": "Check upcoming deadlines",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Submit drafts to a tutor or peer before the due date",
          "kind": "task"
        },
        {
          "title": "Review returned feedback and note what to change",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        }
      ]
    },
    {
      "title": "Exam preparation",
      "description": "Prepare in layers so the final week is review only.",
      "actions": [
        {
          "title": "Collect past papers and sample questions",
          "kind": "task"
        },
        {
          "title": "Complete a timed practice paper",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Create a one-page cheat sheet of key ideas per course",
          "kind": "task"
        },
        {
          "title": "Plan the final week before each exam",
          "kind": "task"
        },
        {
          "title": "Review mistakes from every practice paper",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Asking for help",
      "description": "Use teachers, tutors and classmates early.",
      "actions": [
        {
          "title": "Find office hours and tutoring times for each course",
          "kind": "task"
        },
        {
          "title": "Bring at least one specific question to a teacher or tutor",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Join or start a study group",
          "kind": "task"
        },
        {
          "title": "Talk to an adviser about the term plan",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Focus and attention",
      "description": "Reduce distractions and make deep work easier.",
      "actions": [
        {
          "title": "Set up a dedicated, tidy study space",
          "kind": "task"
        },
        {
          "title": "Install a site blocker for study hours",
          "kind": "task"
        },
        {
          "title": "Use a focus timer for study sessions",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Review where time went last week",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        }
      ]
    },
    {
      "title": "Health and energy",
      "description": "Sleep, move and eat well enough to think clearly.",
      "actions": [
        {
          "title": "Go to bed at a consistent time",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Exercise for 30 minutes",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Eat a real breakfast or first meal",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Identify one stress-relief habit and schedule it",
          "kind": "task"
        },
        {
          "title": "Book a check-in with a counselor if stress feels unmanageable",
          "kind": "task"
        }
      ]
    }
  ]
}$json$::jsonb, 11),
  ('athletic-development', 'premium', 'Athletic development', 'A 16-week block for building strength, skill and consistency in your sport.', $json${
  "goalTitle": "Complete a 16-week training block and improve my key performance test by 10%",
  "vision": "I arrive at the season stronger, fitter and more skilled, trained consistently enough that I trust my body and my preparation.",
  "purpose": {
    "selfTangible": "Beat my own baseline times, lifts or scores",
    "selfIntangible": "Pride in showing up and doing the work",
    "othersTangible": "Be a stronger, more reliable teammate",
    "othersIntangible": "Encourage others to keep training through the hard weeks"
  },
  "outcomes": [
    {
      "title": "Baseline and targets",
      "description": "Measure where I am and choose realistic targets.",
      "measure": {
        "target": 10,
        "current": 0,
        "unit": "% improvement"
      },
      "actions": [
        {
          "title": "Run baseline tests for strength, endurance and sport skills",
          "kind": "task"
        },
        {
          "title": "Record results in a training log",
          "kind": "task"
        },
        {
          "title": "Set targets for week 8 and week 16",
          "kind": "task"
        },
        {
          "title": "Retest and compare at week 8 and week 16",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Strength training",
      "description": "Build general strength with sound technique.",
      "measure": {
        "target": 3,
        "current": 0,
        "unit": "sessions/week"
      },
      "actions": [
        {
          "title": "Do a full-body strength session",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Get a coach to check my main lift technique",
          "kind": "task"
        },
        {
          "title": "Write a progression plan for the main lifts",
          "kind": "task"
        },
        {
          "title": "Log weights and reps",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        }
      ]
    },
    {
      "title": "Conditioning",
      "description": "Develop the fitness the sport demands.",
      "actions": [
        {
          "title": "Easy aerobic session (30-45 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Interval or sport-specific conditioning session",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Test conditioning every four weeks",
          "kind": "task"
        },
        {
          "title": "Adjust the plan if recovery is poor",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Sport skills",
      "description": "Practice the technical skills that decide performance.",
      "actions": [
        {
          "title": "List the three skills that limit my performance most",
          "kind": "task"
        },
        {
          "title": "Skill practice with focused drills (30 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 4
          }
        },
        {
          "title": "Record video of my technique and review it",
          "kind": "task"
        },
        {
          "title": "Ask a coach for feedback on one skill per month",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Mobility and injury prevention",
      "description": "Stay healthy enough to train consistently.",
      "actions": [
        {
          "title": "Warm up before every session (10 min)",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Mobility work (10 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              3,
              5
            ]
          }
        },
        {
          "title": "Book a physio or doctor screening for any ongoing pain",
          "kind": "task"
        },
        {
          "title": "Write a plan for what to do when something hurts",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Nutrition and hydration",
      "description": "Fuel training and recovery with simple habits.",
      "actions": [
        {
          "title": "Plan a standard meal pattern around training",
          "kind": "task"
        },
        {
          "title": "Drink water through the day",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Prepare meals ahead",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Talk to a dietitian if I have specific needs or conditions",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Sleep and recovery",
      "description": "Give the body time to adapt to the work.",
      "measure": {
        "target": 8,
        "current": 0,
        "unit": "hours sleep"
      },
      "actions": [
        {
          "title": "Follow a regular sleep and wake time",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Take full rest days",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Rate energy and soreness in the training log",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Schedule a lighter week every fourth week",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Mindset and consistency",
      "description": "Stay motivated and handle setbacks well.",
      "actions": [
        {
          "title": "Write down why this season matters to me",
          "kind": "task"
        },
        {
          "title": "Review the week's training and plan the next",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Find a training partner or accountability buddy",
          "kind": "task"
        },
        {
          "title": "Set a plan for missed sessions so one miss does not become many",
          "kind": "task"
        }
      ]
    }
  ]
}$json$::jsonb, 12),
  ('language-learning', 'premium', 'Language learning', 'A 6-month plan for reaching comfortable everyday conversation in a new language.', $json${
  "goalTitle": "Hold a 15-minute everyday conversation in my target language within 6 months",
  "vision": "I order food, ask directions and chat with a native speaker without switching to English, and I enjoy the process of learning.",
  "purpose": {
    "selfTangible": "Pass a conversational level check or speaking exam",
    "selfIntangible": "Enjoy the feeling of understanding a new culture",
    "othersTangible": "Communicate with family, friends or colleagues in their language",
    "othersIntangible": "Show respect and build closer relationships"
  },
  "outcomes": [
    {
      "title": "Core vocabulary",
      "description": "Learn the most frequent words and phrases first.",
      "measure": {
        "target": 1000,
        "current": 0,
        "unit": "words"
      },
      "actions": [
        {
          "title": "Choose a frequency-based word list of 1,000 words",
          "kind": "task"
        },
        {
          "title": "Review spaced-repetition flashcards (15 min)",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Add new words from real content I read or hear",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Test vocabulary size every month",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Grammar foundations",
      "description": "Understand the key structures needed for everyday speech.",
      "actions": [
        {
          "title": "Pick one reliable textbook or course",
          "kind": "task"
        },
        {
          "title": "Study one grammar topic and write ten example sentences",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Review a grammar topic from earlier weeks",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Keep a list of recurring mistakes and fix them",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Listening",
      "description": "Train my ear with a steady supply of understandable audio.",
      "actions": [
        {
          "title": "Listen to the language (20 min)",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Listen to a short dialogue three times and write what I hear",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Find two podcasts or shows at my level",
          "kind": "task"
        },
        {
          "title": "Rewatch one episode without subtitles after a month",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Speaking practice",
      "description": "Speak early and often, even when imperfect.",
      "measure": {
        "target": 15,
        "current": 0,
        "unit": "minutes conversation"
      },
      "actions": [
        {
          "title": "Book a trial lesson with a tutor",
          "kind": "task"
        },
        {
          "title": "Hold a conversation session with a tutor or partner",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Speak aloud to myself for five minutes",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Record myself and listen back every two weeks",
          "kind": "task"
        },
        {
          "title": "Prepare answers to ten common questions",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Reading",
      "description": "Build comprehension through graded and real texts.",
      "actions": [
        {
          "title": "Choose graded readers at my level",
          "kind": "task"
        },
        {
          "title": "Read for 20 minutes",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 5
          }
        },
        {
          "title": "Read a short news article or blog each week",
          "kind": "task"
        },
        {
          "title": "Move up one reading level when it feels easy",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Writing",
      "description": "Practice producing the language accurately.",
      "actions": [
        {
          "title": "Write a short journal entry",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 4
          }
        },
        {
          "title": "Ask a tutor or native speaker to correct my writing",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Write a message to a language exchange partner",
          "kind": "task"
        },
        {
          "title": "Collect corrected sentences in my notes",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Culture and immersion",
      "description": "Learn the language in context so it sticks.",
      "actions": [
        {
          "title": "Change phone and app settings to the target language",
          "kind": "task"
        },
        {
          "title": "Watch a show or video in the language",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Find a local meetup or online community",
          "kind": "task"
        },
        {
          "title": "Cook or follow a recipe in the language",
          "kind": "task"
        },
        {
          "title": "Plan a trip or virtual visit to practice",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Routine and motivation",
      "description": "Keep going when the early excitement fades.",
      "actions": [
        {
          "title": "Set a daily study time and protect it",
          "kind": "task"
        },
        {
          "title": "Mark the habit tracker after studying",
          "kind": "routine",
          "schedule": {
            "type": "daily"
          }
        },
        {
          "title": "Review progress and adjust the plan",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Take a level check test at months 3 and 6",
          "kind": "task"
        },
        {
          "title": "Reward each monthly milestone",
          "kind": "task"
        }
      ]
    }
  ]
}$json$::jsonb, 13),
  ('professional-skill', 'premium', 'Professional skill growth', 'A 90-day plan for building one in-demand skill and showing it at work.', $json${
  "goalTitle": "Reach job-ready proficiency in a new professional skill in 90 days",
  "vision": "I can apply this skill to real work without hand-holding, I have proof in my portfolio, and the people I work with know what I can do.",
  "purpose": {
    "selfTangible": "Qualify for a promotion, raise or better role",
    "selfIntangible": "Feel competent and in control of my career direction",
    "othersTangible": "Deliver better results for my team and customers",
    "othersIntangible": "Be someone colleagues trust and learn from"
  },
  "outcomes": [
    {
      "title": "Skill map",
      "description": "Define exactly what proficiency means for my target role.",
      "actions": [
        {
          "title": "Collect five job descriptions that use this skill",
          "kind": "task"
        },
        {
          "title": "List the specific competencies they share",
          "kind": "task"
        },
        {
          "title": "Rate my current level for each competency",
          "kind": "task"
        },
        {
          "title": "Choose the top three gaps to close first",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Structured learning",
      "description": "Follow a clear curriculum instead of random tutorials.",
      "measure": {
        "target": 60,
        "current": 0,
        "unit": "study hours"
      },
      "actions": [
        {
          "title": "Choose one primary course or book and a backup",
          "kind": "task"
        },
        {
          "title": "Study the curriculum (45 min)",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Write a short summary of what I learned",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Finish the course and complete all exercises",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Deliberate practice",
      "description": "Practice on realistic problems, not only passive study.",
      "actions": [
        {
          "title": "Do a timed practice exercise",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Build a small project that uses the skill end to end",
          "kind": "task"
        },
        {
          "title": "Review mistakes and redo one problem",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Increase project difficulty each month",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Real work application",
      "description": "Use the skill in actual projects with real stakes.",
      "actions": [
        {
          "title": "Identify a work task where I can apply the skill",
          "kind": "task"
        },
        {
          "title": "Agree on scope with my manager",
          "kind": "task"
        },
        {
          "title": "Spend focused time on the real project",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 3
          }
        },
        {
          "title": "Write up the results and what I learned",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Portfolio and proof",
      "description": "Create evidence of the skill that others can see.",
      "measure": {
        "target": 2,
        "current": 0,
        "unit": "portfolio pieces"
      },
      "actions": [
        {
          "title": "Pick two best projects to showcase",
          "kind": "task"
        },
        {
          "title": "Write a short case study for each",
          "kind": "task"
        },
        {
          "title": "Update my resume and profile with the skill",
          "kind": "task"
        },
        {
          "title": "Ask for a certificate, reference or review where relevant",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Feedback and mentorship",
      "description": "Learn faster from people who are ahead of me.",
      "actions": [
        {
          "title": "Identify two people with strong skill in this area",
          "kind": "task"
        },
        {
          "title": "Ask one for a monthly 30-minute conversation",
          "kind": "task"
        },
        {
          "title": "Share work for review",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Act on feedback and report back",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Network and visibility",
      "description": "Let the right people know what I am working on.",
      "actions": [
        {
          "title": "Share a short learning update with my team",
          "kind": "task"
        },
        {
          "title": "Comment or ask questions in a professional community",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 2
          }
        },
        {
          "title": "Present a lunch-and-learn or demo",
          "kind": "task"
        },
        {
          "title": "Message three relevant contacts about opportunities",
          "kind": "task"
        }
      ]
    },
    {
      "title": "Time and energy",
      "description": "Fit the plan into a busy working life.",
      "actions": [
        {
          "title": "Block recurring learning time on my calendar",
          "kind": "task"
        },
        {
          "title": "Protect the first learning block of the day",
          "kind": "routine",
          "schedule": {
            "type": "weekdays",
            "days": [
              1,
              2,
              3,
              4,
              5
            ]
          }
        },
        {
          "title": "Review progress against the 90-day plan",
          "kind": "routine",
          "schedule": {
            "type": "weekly",
            "timesPerWeek": 1
          }
        },
        {
          "title": "Drop or delay one lower-value commitment",
          "kind": "task"
        }
      ]
    }
  ]
}$json$::jsonb, 14);
