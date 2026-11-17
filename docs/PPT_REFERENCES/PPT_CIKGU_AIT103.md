# The Only Helper You Need

# CIKGU

> Your Ultimate Campus Buddy

# Bob is a new **Student in XMUM**

\* How to check the timetable?
\* Where to pay for his dorm or visa renewal?
\* How to book a discussion room in library?
\* How to ask for help if his dorm facility is broken?
\* Is he allowed to take a part-time job?

[signature: Tatang Ivannov Kennedy]

# Its frustrating, isn't it?

[signature: Tatang Ivannov Kennedy]

## Information Fragmentation
campus information is scattered across various platforms ( websites, handbooks and PDFs, etc )

## **New Student Confusion**
Complex procedures cause new students to make administrative mistakes.

## **Limitations of Keyword-Based Site Search**
Traditional website search functions often fail to retrieve relevant results

# Bob Needs This

## Centralization
Bob needs a "Single Source of Truth" that pulls from a centralized knowledge base

## Simplicity
Complex academic regulations need to be simplified into concise, human-readable summaries

## Efficiency
Addressing Bob's needs as a student to get information as fast and as compressed as possible

[signature: Tatang Ivannov Kennedy]

# CIKGU

Campus Information & Knowledge Guide for User

**Your Ultimate Campus Buddy**

# **Tech Stack Architecture**

Tatang Ivannov Kennedy

- Modern and modular architecture
- Ensure scalability and developer velocity. Python and FastAPI provide a high-performance backend
- SQL-based DB by Supabase
- Next.js → a responsive, reactive frontend interface.
- LLM-based query parser → handle complex user intent

<table>
<thead>
<tr>
<th>Technology</th>
</tr>
</thead>
<tbody>
<tr>
<td>Python</td>
</tr>
<tr>
<td>FastAPI</td>
</tr>
<tr>
<td>Supabase</td>
</tr>
<tr>
<td>Next.JS</td>
</tr>
<tr>
<td>LLM as query parser</td>
</tr>
</tbody>
</table>

# DATABASE & PREPROCESSING

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

**DATABASE + PREPROCESSOR**

# My section explains how campus Q&A becomes searchable chatbot knowledge.

## Database layer
703 local Q&A rows now; Supabase and 1000+ rows are the next checkpoint.

- local JSON
- Supabase next
- keywords

## Preprocessor
Turns messy student wording into stable search terms.

- normalize
- filter
- synonyms

MY PART

Tiong Tong Jun AIT2509065 [signature]

XMUM CAMPUS CHATBOT

LOCAL -> SUPABASE -> 1000+

# Database progress in three checkpoints.

<table>
<thead>
<tr>
<th>Phase</th>
<th>Content</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>NOW</b></td>
<td><b>703</b><br />local Q&#x26;A rows<br />first usable knowledge base</td>
</tr>
<tr>
<td><b>NEXT</b></td>
<td><b>Supabase</b><br /><b>teammate push later</b><br />same rows, database storage</td>
</tr>
<tr>
<td><b>THEN</b></td>
<td><b>1000+</b><br />cloud Q&#x26;A rows<br />continue expanding in Supabase</td>
</tr>
</tbody>
</table>

DATABASE UPDATE

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

DATA PIPELINE

**FROM SOURCES TO SEEDS**

# We cleaned information before it became database rows.

<table>
  <tr>
    <th>01</th>
    <td><b>Sources</b><br />website, handbooks, PDFs</td>
  </tr>
<tr>
    <th>02</th>
    <td><b>Raw text</b><br />extract useful campus facts</td>
  </tr>
<tr>
    <th>03</th>
    <td><b>Q&#x26;A</b><br />rewrite as student questions</td>
  </tr>
<tr>
    <th>04</th>
    <td><b>JSON seeds</b><br />module, category, keywords</td>
  </tr>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

**FOUR SEED FILES**

# Most rows cover daily campus life and academic navigation.

<table>
  <tr>
    <th>Category</th>
    <th></th>
    <th>Value</th>
  </tr>
<tr>
    <td><b>Campus life</b></td>
    <td><mark>pink</mark></td>
    <td>340</td>
  </tr>
<tr>
    <td><b>Academic</b></td>
    <td><mark>teal</mark></td>
    <td>253</td>
  </tr>
<tr>
    <td><b>Admin</b></td>
    <td><mark>lightblue</mark></td>
    <td>74</td>
  </tr>
<tr>
    <td><b>General</b></td>
    <td><mark>lightpurple</mark></td>
    <td>36</td>
  </tr>
</table>

703 LOCAL ROWS

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

KNOWLEDGE ITEM

ONE ROW = CONTENT + MATCHING SIGNALS

# A Q&A row is more than an answer.

## EXAMPLE QUESTION

# How do I connect to campus Wi-Fi?

The row stores the answer plus routing clues.

<table>
  <tr>
    <th>module</th>
    <th>sub_intent</th>
  </tr>
<tr>
    <td>campus_life</td>
    <td>it_connectivity</td>
  </tr>
<tr>
    <th>answer</th>
    <th>keywords</th>
  </tr>
<tr>
    <td>what bot replies</td>
    <td>wifi, network</td>
  </tr>
<tr>
    <th>result</th>
  </tr>
<tr>
    <td>searchable knowledge item</td>
  </tr>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

CATEGORIES

MODULE -> SUB-INTENT -> ANSWER ROW

# Sub-intent narrows the search lane.

<table>
<thead>
<tr>
<th>Category</th>
</tr>
</thead>
<tbody>
<tr>
<td>Wi-Fi question</td>
</tr>
<tr>
<td>campus_life</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td>it_connectivity</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td><mark>Wi-Fi row</mark></td>
</tr>
<tr>
<td>Visa question</td>
</tr>
<tr>
<td>academic_navigation</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td>visa_immigration</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td><mark>visa row</mark></td>
</tr>
<tr>
<td>Office question</td>
</tr>
<tr>
<td>admin_directory</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td>contact_us</td>
</tr>
<tr>
<td>v</td>
</tr>
<tr>
<td><mark>contact row</mark></td>
</tr>
</tbody>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

PREPROCESSOR

**TRANSLATION LAYER**

# Preprocessor translates student wording into database terms.

<table>
  <thead>
    <tr>
      <th>STUDENT WORDS</th>
      <th>DATABASE TERMS</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>wireless</td>
      <td>wifi</td>
    </tr>
<tr>
      <td>dorm</td>
      <td>hostel</td>
    </tr>
<tr>
      <td>outlook</td>
      <td>student email</td>
    </tr>
  </tbody>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

**PREPROCESSOR**

**NORMALIZE + FILTER**

# First: remove noise and keep useful words.

<table>
  <tr>
    <th>Raw</th>
    <th>Remove noise</th>
    <th>Keep</th>
  </tr>
<tr>
    <td>"Hello, how do I connect to campus Wi-Fi??"</td>
    <td>hello, how, do, i</td>
    <td><mark>connect</mark> <mark>campus</mark> <mark>wi-fi</mark></td>
  </tr>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

**PREPROCESSOR**

# CANONICAL VOCABULARY

# Different words can mean the same campus topic.

<table>
<thead>
<tr>
<th>Word</th>
<th>Meaning</th>
</tr>
</thead>
<tbody>
<tr>
<td>wireless</td>
<td><mark>wifi</mark>
</td>
</tr>
<tr>
<td>dorm</td>
<td><mark>hostel</mark>
</td>
</tr>
<tr>
<td>outlook</td>
<td><mark>student email</mark>
</td>
</tr>
<tr>
<td>pay tuition</td>
<td><mark>fees</mark>
</td>
</tr>
</tbody>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

PREPROCESSOR

**2-WORD AND 3-WORD PHRASES**

# Some meanings must stay as phrases.

<table>
  <tr>
    <td>office 365<br />-><br />student email</td>
    <td>password reset<br />-><br />account help</td>
    <td>visa approval letter<br />-><br />EVAL</td>
  </tr>
</table>

Tiong Tong Jun AIT2509065

XMUM CAMPUS CHATBOT

PREPROCESSOR

**FINAL OUTPUT**

# Final output: a richer query.

<table>
<thead>
<tr>
<th>Step</th>
<th>Label</th>
<th>Content</th>
</tr>
</thead>
<tbody>
<tr>
<td>01</td>
<td>Input</td>
<td>campus Wi-Fi?</td>
</tr>
<tr>
<td>02</td>
<td>Clean words</td>
<td>connect, campus</td>
</tr>
<tr>
<td>03</td>
<td>Expanded</td>
<td>wifi, network</td>
</tr>
<tr>
<td>04</td>
<td>Query</td>
<td>ready for retrieval</td>
</tr>
</tbody>
</table>

Tiong Tong Jun AIT2509065

Tatang Ivannov Kennedy

# Intent Classification

Classify the topic

# How we implemented this?
We identify a user's goal, intent, or desire behind the text queries they enter.

## Objective
- Categorizes queries into specific knowledge modules
- (admin_directory, campus_life, academic_navigation)
- also submodules

## Methods
- keyword extraction and synonym expansion using preprocessor
- calculates a match score for those keywords against the rule dictionary (keyword map) of each sub-intent.

## After Classifying
The detection results in the form of module names and sub-intents are forwarded to the Knowledge Retriever section
→ limit search space and speed up answer discovery

[Tatang Ivannov Kennedy]

<table>
<thead>
<tr>
<th>Authors</th>
<th>Year</th>
<th>Title</th>
<th>Source/Link</th>
</tr>
</thead>
<tbody>
<tr>
<td>Chen, Q., Zhuo, Z., &#x26; Wang, W.</td>
<td>2019</td>
<td>BERT for Joint Intent Classification and Slot Filling</td>
<td>arXiv:1902.10909</td>
</tr>
<tr>
<td>Tur, G., &#x26; Deng, L.</td>
<td>2011</td>
<td>Intent Determination and Spoken Utterance Classification</td>
<td>In G. Tur &#x26; R. De Mori (Eds.), Spoken Language Understanding: Systems for Extracting Semantic Information from Speech. Wiley.</td>
</tr>
<tr>
<td>Larson, S., Mahendran, A., Peper, J. J., Clarke, C., Lee, A., Hill, P., Kummerfeld, J. K., Leach, K., Laurenzano, M. A., Tang, L., &#x26; Mars, J.</td>
<td>2019</td>
<td>An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction</td>
<td>EMNLP-IJCNLP 2019. arXiv:1909.02027</td>
</tr>
</tbody>
</table>

# Entity Recognition

Recognize the Entities 👀

Evan Christian

# How we implement this?
Finding and grouping important keywords from a user's message

## Objective
Extract target terms like facilities, offices, system names, and actions (verbs) from the query.

## Methods
When a query arrives, we split it into words (tokenization), label the parts of speech (verbs/nouns), and match them against a predefined catalog.

## After Classifying
The extracted terms are passed to the Retriever to rank and fetch the best database answer.

∞ XMUM CAMPUS CHATBOT

# Retriever logic and backend connection for response generation

Presented by: Rekab Maria Chahrazed (AIT2509154)

# Data Base connexion

Our chat bot receive the clean input from pre processing with all the correct intent. Now the retriever fetches the questions from the data base it will go though each row using a for loop based on their module, keyword and sub_intent and unique ID. the user input received from pre processing (intent classification and entity extraction) using the specific module the retriever will only search responses relevant to that in the data then print all possible candidates and count them and put them in a new empty table if no candidate it will stay in the data base .

<table>
  <tr>
    <th></th>
    <th></th>
    <th></th>
  </tr>
<tr>
    <td></td>
    <td></td>
    <td></td>
  </tr>
<tr>
    <td></td>
    <td></td>
    <td></td>
  </tr>
<tr>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>

Presented by: Rekab Maria Chahrazed (AIT2509154)

# Candidate scoring for best match

## Best score = Best answer

- Now our retriever won't compute the score for the whole data base only the candidate table to minimise computational load
- The scoring function will compare the user input to all the candidates using keywords match and entity matching ex()
- It returns a numerical score the higher the better score it gets the more it will be chosen as a best match answer

Presented by: Rekab Maria Chahrazed (AIT2509154)

# Scoring logic for retrieving best solution

## How do I borrow books from the library?

### MethodScore
- Exact keyword match +2 points
- Partial keyword match +1 point
- Entity match +3 points
- Proper noun (POS) match +1.5 points

```json
{
  "facility": ["library"],
  "action": ["borrow"]
}
```

## Entity scoring gives additional weight to important campus-related terms identified by the Entity Recognizer. Recognized entity types include:
- Facilities
- Offices
- Academic systems
- Actions
- Food types

### Scoring Rule

<table>
<thead>
<tr>
<th>Condition</th>
<th>Points</th>
</tr>
</thead>
<tbody>
<tr>
<td>1. Compare every stored keyword with the user's message.</td>
<td>-</td>
</tr>
<tr>
<td>2. If the keyword appears exactly,</td>
<td>add 2 points</td>
</tr>
<tr>
<td>3. If there is only a partial match,</td>
<td>add 1 point</td>
</tr>
<tr>
<td>4. Repeat for all keywords.</td>
<td>-</td>
</tr>
</tbody>
</table>

## How it works
For each knowledge item:
1. Compare every stored keyword with the user's message.
2. If the keyword appears exactly, add 2 points.
3. If there is only a partial match, add 1 point.
4. Repeat for all keywords.

# Front end design and Flask API backend implementation

## User Question

POST request from the front end

- XMUMChatbot preprocessing
- Entity Recognition
- Intent Classification
- Knowledge Retrieval
- Generate Response
- JSON Response

**Frontend**

## Purpose of this API
Acts as the communication layer between the web interface and the chatbot NLP pipeline

- Suggestion questions are dynamically retrieved from the Flask endpoint:
- JavaScript generates buttons automatically.
- Clicking a button inserts the question into the input field and immediately sends it to the chatbot.

<table>
<thead>
<tr>
<th>Category</th>
<th>Question</th>
</tr>
</thead>
<tbody>
<tr>
<td>Quick questions:</td>
<td>Where can students report lost items or ...</td>
</tr>
<tr>
<td></td>
<td>What is the main role of the Student Hel...</td>
</tr>
<tr>
<td></td>
<td>How can users get assistance with WIFI l...</td>
</tr>
<tr>
<td></td>
<td>Who is eligible to apply for student acc...</td>
</tr>
<tr>
<td></td>
<td>What is the deadline for submitting acco...</td>
</tr>
<tr>
<td></td>
<td>What are the steps to apply for student ...</td>
</tr>
<tr>
<td></td>
<td>What is the minimum CGPA required for gr...</td>
</tr>
<tr>
<td></td>
<td>What is the minimum grade required to pa...</td>
</tr>
<tr>
<td></td>
<td>When is the Semester Break after the Feb...</td>
</tr>
<tr>
<td></td>
<td>Hello! I'm the XMUM Campus Assistant 🍎<br />Ask me anything about campus life, library, hostel, scholarships, WiFi, food, transport, and more!</td>
</tr>
</tbody>
</table>

Presented by: Rekab Maria Chahrazed (AIT2509154)

XMUM CAMPUS CHATBOT

# Fallback Handling & Response Generation

Presented by: Lai Chun Chyi (AIT2509063)

XMUM CAMPUS CHATBOT

# Out-of-Scope Prediction (Larson et al, 2019)

- Establishes the necessity of strict numeric confidence boundaries to intercept irrelevant user inputs

Larson, S., Mahendran, A., Peper, J. J., Clarke, C., Lee, A., Hill, P., Kummerfeld, J. K., Leach, K., Laurenzano, M. A., Tang, L., & Mars, J. (2019, November 1). An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction. Aclanthology.org. https://doi.org/10.18653/v1/D19-1131

# Template-Based NLG (Reiter & Dale, 2000)

- Utilizes controlled structural templates to eliminate factual AI hallucinations.

Reiter, E., & Dale, R. (2000). Building Natural Language Generation Systems. Cambridge University Press. Retrieved from ResearchGate (Publication ID: 257384038).

Presented by: Lai Chun Chyi (AIT2509063)

XMUM CAMPUS CHATBOT

# Decision Matrix & Threshold-Based Fallbacks

## High Confidence (≥ 50%)
Triggers direct, template-wrapped official handbook answers.

## Borderline Confidence (35% - 49%)
Instead of guessing blindly, the bot asks a clarifying question using the closest matched intent. For example: Did you mean "library hours"?

## Low Confidence (< 35%)
Quietly drops the query into an administrative log and gives a polite fallback response.

Presented by: Lai Chun Chyi (AIT2509063)

XMUM CAMPUS CHATBOT

# Dynamic Template Generation & Humanized Varied Phrasing

## ✖ Context-Aware Greetings
Uses python's "datetime" module to check system time and dynamically inject "Good morning", "Good afternoon", or "Good evening".

## ✖ Personalization
Formats responses with the student's name (user_name="Alex") and logs the exact processing date.

## ✖ Mitigating Robotic Fatigue
Implements a randomized pool of phrases (self._fallback_pool) so users don't get hit with the exact same error message repeatedly if they get stuck.

Presented by: Lai Chun Chyi (AIT2509063)

# XMUM CAMPUS CHATBOT

```python
fallback_pool = [
    "I didn't quite catch that. Could you please rephrase your campus-related question?",
    "<u>XMUM</u> handbook! Could you try asking that another way?",
    <u>I'm sorry, I don't have information on that topic yet. If your issue is urgent, please contact the XMUM Academic Affairs</u>
]

return random.choice(fallback_pool)
```

<table>
  <tr>
    <th>File</th>
  </tr>
<tr>
    <td>part5.py</td>
  </tr>
<tr>
    <td>failed_queries.txt</td>
  </tr>
</table>

1 <mark>[2026-06-29 19:16:22]</mark> UNRECOGNIZED QUERY: Can I order chicken rice through this chatbot?

Presented by: Lai Chun Chyi (AIT2509063)

XMUM CAMPUS CHATBOT

# Admin Safety Net & Escalation Logic

* ✗ **Unrecognized Query Logging**
Automatically logs failed user raw text along with a precise [YYYY-MM-DD HH:MM:SS] timestamp to a local txt file.

* ✗ **Crowdsourcing Knowledge Gaps**
Admins can review this text file later to patch the database with missing QA pairs.

Presented by: Lai Chun Chyi
(AIT2509063)

XMUM CAMPUS CHATBOT

# Context Management & Session Tracking

Presented by:
TEN QI YI AIT2509064

# **Without Context**
## Management

Who are you again?

# **With Context**
## Management



Presented by: TEN QI YI AIT2509064

# How does it work ?

MAX TURNS = 2  
(threshold)

<table>
<thead>
<tr>
<th>Index</th>
<th>State</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>Pruned(Expired)</td>
</tr>
<tr>
<td>2</td>
<td>Pruned(Expired)</td>
</tr>
<tr>
<td>3</td>
<td>Active Context</td>
</tr>
<tr>
<td>4</td>
<td>Active Context</td>
</tr>
<tr>
<td>5</td>
<td>Active Context</td>
</tr>
<tr>
<td>6</td>
<td>Active Context</td>
</tr>
<tr>
<td>7</td>
<td>Active Context</td>
</tr>
<tr>
<td>8</td>
<td>Active Context</td>
</tr>
</tbody>
</table>

**MEMORY CHANNEL**

Presented by: TEN QI YI AIT2509064

[signature: TEN QI YI]

# <u>Theoretical Foundations</u>

## **Dialogue State Tracking**
*The Dialog State Tracking Challenge Series: A Review*
*JD Williams, Antoine Raux, Matthew Henderson 2016*
→ Isolates concurrent users

## **Sliding Windows Algorithm**
*Longformer: The long-document transformer*
*Iz Beltagy, Matthew E. Peters, Arman Cohan 2020*
→ Constrains context length

## **~~_FIFO(First-In-First-Out) Buffer~~**
*Operating System Concepts*
*Silberschatz, A., Galvin, P. B., HV & Gagne, G. 2018*
→ Evicts oldest data first

Presented by:
TEN QI YI AIT2509064

# Interaction Flow

<table>
<thead>
<tr>
<th>Step</th>
<th>Process</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>User input</td>
</tr>
<tr>
<td>2</td>
<td>Frontend Chat UI</td>
</tr>
<tr>
<td>3</td>
<td>API FastAPI</td>
</tr>
<tr>
<td>4</td>
<td>Preprocessor: Greeting/ Exact Match Check</td>
</tr>
<tr>
<td>5</td>
<td>Greeting?</td>
</tr>
<tr>
<td>6</td>
<td>Yes -> Return Greet</td>
</tr>
<tr>
<td>7</td>
<td>No -> Exact Matching?</td>
</tr>
<tr>
<td>8</td>
<td>Yes -> Supabase Database: knowledge_items</td>
</tr>
<tr>
<td>9</td>
<td>No -> Gemini LLM: Translate and Correction</td>
</tr>
<tr>
<td>10</td>
<td>Intent Classifier &#x26; Entity Recognition</td>
</tr>
<tr>
<td>11</td>
<td>Supabase Database: knowledge_items</td>
</tr>
<tr>
<td>12</td>
<td>Answer Found</td>
</tr>
<tr>
<td>13</td>
<td>No -> Return didn't found the answer</td>
</tr>
<tr>
<td>14</td>
<td>Yes -> Return answer</td>
</tr>
<tr>
<td>15</td>
<td>Is User Input English?</td>
</tr>
<tr>
<td>16</td>
<td>Yes -> Return answer</td>
</tr>
<tr>
<td>17</td>
<td>No -> Gemini LLM: Translate</td>
</tr>
</tbody>
</table>

# DEMO

<u>https://xmum-chatbot.vercel.app/</u>

QR Code

Scan me!

# Future Improvement

## Automated Document Processing
Building an automated ingestion pipeline that can directly read new Student Handbook PDF files, chunk them, and then save them directly to the database.

## Hybrid Search
Combining existing keyword-based searches (keyword matching) with vector searches (Vector Search) using a Vector Database

## Dashboard Analysis & Feedback Loop
Logged most frequent questions, unanswered queries to the admin dashboard and added thumbs up/down button feature to the user interface, volume + latency

XMUM Chatbot

# Thank You
# For Your Attention

Whenever you need a guide
CIKGU will be by your side

📍 LY3 109
<u>https://xmum-chatbot.vercel.app</u>