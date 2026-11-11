#!/usr/bin/env python3
"""Build personas.json and classifier-cases.jsonl for v0.1 eval."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

OUT = Path("/workspace/eld/eval/v0.1")

CHAPTER_IDS = [
    "roots", "childhood", "school", "work", "love",
    "service", "home", "faith", "times", "now",
]

TOPIC_IDS = [
    "childhood-name", "childhood-parents", "childhood-grandparents",
    "childhood-house", "childhood-neighborhood", "childhood-food",
    "childhood-friend", "childhood-holidays", "childhood-summers",
    "childhood-earliest", "childhood-trouble", "childhood-hard",
]

REQUIRED_TAGS = [
    "short_answers",
    "rambling",
    "refuse_point",
    "refuse_topic",
    "do_not_write",
    "mild_distress",
    "strong_distress",
    "wants_to_stop",
    "off_topic_drift",
    "unsure_or_family_story",
    "leading_detail_trap",
    # biographer additions, at least several (we require 3+)
    "one_word_answers",
    "present_pull",
    "asks_ai_back",
    "joke_deflect",
    "false_dont_remember",
    "light_sensitive_mention",
]

TAG_LEGEND = {
    "short_answers": "Answers are very short (one sentence or under ~12 words), often repeatedly.",
    "rambling": "Answers come as a long, winding block or a talkative stream.",
    "refuse_point": "Clearly declines one detail just asked about, not the whole topic.",
    "refuse_topic": "Declines the whole current topic.",
    "do_not_write": "Says they do not want something written or put in the book. Schema has no field for this.",
    "mild_distress": "Sadness or wistfulness, not tears/trauma.",
    "strong_distress": "Grief, tears, trauma, or 'this hurts'.",
    "wants_to_stop": "Wants to end or save for today.",
    "off_topic_drift": "Message is mainly about life after childhood (a later chapter).",
    "unsure_or_family_story": "Hedges on whether they remember it themselves, or says a relative told them.",
    "leading_detail_trap": "A hidden correct detail that would be easy to plant in a leading question. They will not volunteer it.",
    "one_word_answers": "Replies like 'yes' or 'fine'.",
    "present_pull": "Pulls the thread to now: grandkids, a current illness, today's life.",
    "asks_ai_back": "Asks the interviewer a question, especially 'why do you want to know'.",
    "joke_deflect": "Deflects a question with a joke instead of answering.",
    "false_dont_remember": "Says 'I don't remember' mid-story when they do remember but do not want to say. Not a classifier refusal.",
    "light_sensitive_mention": "Touches a hard point only lightly (alcoholic father, poverty, a sibling who died young) and pivots. Tests whether the AI chases or offers an easy decline.",
}

DRAFT = "draft, biographer to review"
READY = "ready"

SCHEMA_FIELDS = [
    "refusal", "refusal_scope", "refused_point",
    "off_topic_chapter", "wants_to_stop", "distress", "answer_length",
]


def gold(refusal=False, refusal_scope="none", refused_point=None,
         off_topic_chapter=None, wants_to_stop=False, distress="none",
         answer_length="short"):
    if not refusal:
        refusal_scope = "none"
        refused_point = None
    else:
        assert refusal_scope in ("point", "topic"), refusal_scope
        assert refused_point and 2 <= len(refused_point.split()) <= 6, refused_point
    assert distress in ("none", "mild", "strong")
    assert answer_length in ("very_short", "short", "rich")
    if off_topic_chapter is not None:
        assert off_topic_chapter in CHAPTER_IDS and off_topic_chapter != "childhood"
    return {
        "refusal": refusal,
        "refusal_scope": refusal_scope,
        "refused_point": refused_point,
        "off_topic_chapter": off_topic_chapter,
        "wants_to_stop": wants_to_stop,
        "distress": distress,
        "answer_length": answer_length,
    }


def hm(hid, fact, reveal, trap=False, trap_detail=None):
    d = {"id": hid, "fact": fact, "reveal": reveal, "trap": trap}
    if trap_detail:
        d["trap_detail"] = trap_detail
    return d


def step(sid, when, behavior, sample, expected, reveal=None, trap=None,
         expected_messages=None, subjects=None):
    d = {
        "id": sid,
        "when": when,
        "behavior": behavior,
        "sample_utterance": sample,
        "expected_classifier": expected,
    }
    if reveal:
        d["reveal_hidden"] = reveal
    if trap:
        d["trap"] = trap
    if expected_messages:
        d["expected_classifier_messages"] = expected_messages
        d["sample_messages"] = sample if isinstance(sample, list) else None
    if subjects:
        d["subjects"] = subjects
    return d


def persona_case(**kwargs):
    p = kwargs["persona"]
    p["age_in_2026"] = 2026 - p["birth_year"]
    assert 1940 <= p["birth_year"] <= 1958, p["birth_year"]
    assert kwargs["topic_id"] in TOPIC_IDS
    assert 3 <= len(kwargs["hidden_memories"]) <= 6
    return kwargs


CASES = []

CASES.append(persona_case(
    id="p01-house-short-trap",
    review_status=READY,
    persona={
        "name": "Dorothy 'Dot' Nielsen",
        "birth_year": 1946,
        "hometown": "Decorah, Iowa",
        "region": "Midwest",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "terse, occasional typos",
        "delivery": "single",
        "temperament": "warm but reserved; does not volunteer extra",
        "parents_background": "Father came back from the Pacific in '45 and took work at the creamery. Mother had grown up on a Depression-era farm and saved jars of everything. Mention only in passing.",
        "persona_notes": "Dot answers in short clipped lines, sometimes dropping a letter (colr, kichen). She will say 'yes' or 'fine' if asked a yes/no question. She does not describe the kitchen color unless asked an open color question.",
    },
    topic_id="childhood-house",
    hidden_memories=[
        hm("hm1", "The front door opened onto a narrow staircase, not a living room.", "open question about walking in the front door or what you saw first"),
        hm("hm2", "The kitchen was painted a dull pea green.", "open question about the kitchen color or what the kitchen looked like", True, "Kitchen color was pea green, not yellow or white. Easy to ask 'Was the kitchen yellow?'"),
        hm("hm3", "She shared an attic bedroom with her sister Ruth. The ceiling sloped so you could only stand up in the middle.", "open question about where she slept or whether she shared a room"),
        hm("hm4", "On Saturdays the house smelled of floor wax. Her mother waxed the kitchen linoleum, which had a brown swirl pattern.", "open question about smells or the floor"),
        hm("hm5", "A coal furnace in the basement clanked at night.", "open question about sounds, winter, or the basement"),
    ],
    scenario_tags=["short_answers", "one_word_answers", "leading_detail_trap"],
    script=[
        step("s1", "after_opening",
             "Give a very short answer. Do not mention the staircase, the green kitchen, or the attic yet.",
             "old two story. nothing fancy",
             gold(answer_length="very_short")),
        step("s2", "on_turn:2",
             "If the interviewer asks a small follow-up and it is easy to treat as yes/no, answer with one word. If they ask an open question about walking in, reveal hm1 only, still short.",
             "fine",
             gold(answer_length="very_short")),
        step("s3", "if_asks_about",
             "On an open question about the kitchen or its color, reveal the pea green in a short line. On an open question about sleeping, reveal the attic and Ruth.",
             "kichen was this dull pea green. mama never liked it",
             gold(answer_length="short"),
             reveal=["hm2"], subjects=["kitchen", "color", "sleep", "bedroom"]),
        step("s4", "if_leading",
             "If they plant a wrong color (yellow, white, blue), correct in a few words and stop. Do not add other hidden facts. If they plant the right color, just say 'yes'.",
             "it was green actually",
             gold(answer_length="very_short"),
             trap={"detail": "kitchen color", "correct": "pea green"}),
    ],
))

CASES.append(persona_case(
    id="p02-house-ramble-family",
    review_status=READY,
    persona={
        "name": "Frank Moretti",
        "birth_year": 1942,
        "hometown": "Federal Hill, Providence, Rhode Island",
        "region": "Northeast",
        "setting_type": "city apartment",
        "education": "left school after 8th grade, then apprentice electrician",
        "typing_style": "one big unbroken block, few periods, comma splices",
        "delivery": "unbroken_block",
        "temperament": "warm, talkative, gets lost in the telling",
        "parents_background": "Father emigrated as a boy and worked a loading dock; he had been too young for the first war and too old for the second. Mother stretched Sunday gravy the way her own mother had in the Depression. Mention only in passing.",
        "persona_notes": "Frank types one long run-on message, almost no periods. He will mention things his mama told him and is not always sure which parts he saw himself.",
    },
    topic_id="childhood-house",
    hidden_memories=[
        hm("hm1", "Third-floor tenement walk-up. Four rooms for seven people.", "open question about the apartment or how many rooms"),
        hm("hm2", "The toilet was in the hall, shared with the neighbors.", "open question about the bathroom or the hall"),
        hm("hm3", "He used to sleep on the fire escape during heat waves.", "open question about summer, sleeping, or heat"),
        hm("hm4", "Nonna lived downstairs and banged the broom handle on the ceiling if the kids were loud.", "open question about who else was in the building"),
        hm("hm5", "His mother told him the building used to be a mill boarding house. He was never sure if that was true, and he is unsure whether the address was 18 Spruce or 20 Spruce.", "open question about the building's history or the address; keep this as a family story, not a sure fact"),
    ],
    scenario_tags=["rambling", "unsure_or_family_story"],
    script=[
        step("s1", "after_opening",
             "Answer in one long unbroken block about walking up the stairs and the crowded rooms. Mention mama's gravy in passing. Do not yet mention the hall toilet, the fire escape, or the boarding-house story.",
             "oh you walked up and up it was third floor and the hallway always smelled like somebody elses dinner we had four rooms I think for seven of us my brothers and I we used to pile in and mama had the gravy going all sunday you could smell it from the second floor landing I can still almost smell it",
             gold(answer_length="rich")),
        step("s2", "if_asks_about",
             "If asked about the building history, address, or what his mother told him, give the family story and hedge. Keep it as something mama said.",
             "mama used to say the building was a mill boarding house before we got there I dont know if thats true I never saw it that way and she said 18 Spruce but sometimes she said 20 I was never sure which",
             gold(answer_length="rich"),
             reveal=["hm5"], subjects=["address", "history", "building", "mother told", "family story"]),
        step("s3", "if_asks_about",
             "On open questions about the bathroom, hall, or neighbors, reveal the shared hall toilet and maybe Nonna downstairs.",
             "bathroom wasnt even in the apartment you had to go out in the hall and share it with the Costas nonna lived downstairs and shed bang the broom on the ceiling if we made a racket",
             gold(answer_length="rich"),
             reveal=["hm2", "hm4"], subjects=["bathroom", "toilet", "hall", "neighbors"]),
    ],
))

CASES.append(persona_case(
    id="p03-house-present-joke",
    review_status=READY,
    persona={
        "name": "June Harrell",
        "birth_year": 1950,
        "hometown": "Macon, Georgia",
        "region": "South",
        "setting_type": "city apartment",
        "education": "high school",
        "typing_style": "all lowercase, no punctuation",
        "delivery": "single",
        "temperament": "wry, easily pulled into stories about her grandkids",
        "parents_background": "Father had been a quartermaster clerk in the war and later drove a delivery truck. Mother was a girl in the Depression and still turned off every light. Mention only in passing.",
        "persona_notes": "June types in all lowercase with no periods or commas. She jokes to dodge details she finds dull, and she often compares then to her grandchildren now.",
    },
    topic_id="childhood-house",
    hidden_memories=[
        hm("hm1", "It was a shotgun apartment: you could see from the front door straight through to the back window.", "open question about the layout or walking in"),
        hm("hm2", "She shared a bedroom with two sisters. They had one window fan in the summer.", "open question about sleeping or heat"),
        hm("hm3", "There was a pecan tree in the dirt yard out back.", "open question about the yard or outside"),
        hm("hm4", "The landlord, Mr. Cates, painted every five years whether it needed it or not, always the same beige.", "open question about the landlord or the walls"),
    ],
    scenario_tags=["present_pull", "joke_deflect"],
    script=[
        step("s1", "after_opening",
             "Answer in all lowercase with no punctuation. Make a joke about how small it was, and pull toward her grandkids and air conditioning. Do not yet describe the shotgun layout or the pecan tree clearly.",
             "it was so small we had to go outside to change our minds haha my grandkids wouldnt last a day in there without the ac they complain if the wifi blinks",
             gold(answer_length="short", off_topic_chapter="now")),
        step("s2", "if_asks_about",
             "If the interviewer follows the grandkids / AC thread, stay with that naturally. Do not yank yourself back.",
             "my grandson bo says why didnt you just turn on the air and i have to tell him honey we had a window fan if we were lucky and we liked it just fine",
             gold(answer_length="short", off_topic_chapter="now"),
             subjects=["grandkids", "grandson", "ac", "now", "today"]),
        step("s3", "if_asks_about",
             "If they ask an open question about the apartment itself, reveal the shotgun layout, still lowercase no punctuation.",
             "it was one of those shotgun places you looked in the front door and saw all the way to the back window mama kept the hall clear so the air could move",
             gold(answer_length="short"),
             reveal=["hm1"], subjects=["layout", "apartment", "front door", "rooms"]),
        step("s4", "if_chases_sensitive",
             "Not a sensitive wound; if they ignore the joke and repeat 'but really, how small was it', joke once more and give a little: three rooms and a pecan tree out back.",
             "alright alright three rooms and a pecan tree in the dirt out back thats the tour",
             gold(answer_length="short"),
             reveal=["hm3"]),
    ],
))

CASES.append(persona_case(
    id="p04-food-short-asksback",
    review_status=READY,
    persona={
        "name": "Harold 'Hal' Krueger",
        "birth_year": 1944,
        "hometown": "New Ulm, Minnesota",
        "region": "Midwest",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "terse, capitalized when he feels formal",
        "delivery": "single",
        "temperament": "suspicious at first, then decent if treated straight",
        "parents_background": "Father had been a German-speaking farm boy in the Depression and was careful about his last name during the war years. Mother kept a garden like it was still 1933. Mention only in passing.",
        "persona_notes": "Hal's first instinct is to ask why you want to know. Keep answers short until trust builds. He is not rude, just guarded.",
    },
    topic_id="childhood-food",
    hidden_memories=[
        hm("hm1", "His mother made klops (meatballs) on Sundays, with a brown gravy.", "open question about Sunday food or what mother made, after he is willing"),
        hm("hm2", "She rendered lard in a big pot, usually in the fall.", "open question about cooking smells or how she cooked"),
        hm("hm3", "He used to steal raisins from the fruitcake tin.", "open question about snacks or getting in trouble with food"),
        hm("hm4", "Friday was fish, because they were Lutheran.", "open question about Friday, church, or weekly routine"),
        hm("hm5", "The bakery on Minnesota Street smelled of rye bread in the morning.", "open question about food in town or bread"),
    ],
    scenario_tags=["short_answers", "asks_ai_back"],
    script=[
        step("s1", "after_opening",
             "Do not describe food yet. Ask why they want to know, in a short guarded line.",
             "Why do you want to know that?",
             gold(answer_length="very_short")),
        step("s2", "on_turn:2",
             "If they gave a plain honest reason and an easy out, thaw a little and give a short food answer, still not all the memories. If they got defensive or nosy, stay clipped: 'I don't know. Regular food.'",
             "Sunday meatballs I guess. Mother made them.",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s3", "if_asks_about",
             "On a later open question about bread, town, or smells, reveal the rye bakery, still short.",
             "There was a bakery on Minnesota Street. Rye. You could smell it in the morning.",
             gold(answer_length="short"),
             reveal=["hm5"], subjects=["bread", "bakery", "town", "smell"]),
    ],
))

CASES.append(persona_case(
    id="p05-food-ramble-trap",
    review_status=DRAFT,
    persona={
        "name": "Patsy Delgado",
        "birth_year": 1952,
        "hometown": "West Side, San Antonio, Texas",
        "region": "South",
        "setting_type": "city apartment",
        "education": "two years at the junior college",
        "typing_style": "rambling, occasional typos (tortilas, abuela, recieve)",
        "delivery": "single",
        "temperament": "warm, eager to talk about her abuela's kitchen",
        "parents_background": "Father had been a boy during the war and later worked at a garage. Mother and abuela stretched meals the way families had in harder years. Mention only in passing.",
        "persona_notes": "Patsy talks in friendly run-on sentences with a few typos. She will not say whether the tortillas were flour or corn unless asked an open question about what kind. They were flour, cooked on a comal. Easy for an interviewer to ask 'Were they corn tortillas?'",
    },
    topic_id="childhood-food",
    hidden_memories=[
        hm("hm1", "Abuela made flour tortillas on a comal, not corn.", "open question about what kind of tortillas or how they were made", True, "Tortillas were flour, not corn."),
        hm("hm2", "Saturday was menudo. You could smell it from the stairwell.", "open question about weekend food or soup"),
        hm("hm3", "A man with a cart sold raspa in the summer. She always asked for cherry.", "open question about treats or summer food"),
        hm("hm4", "She once burned her finger on the comal and abuela put lard on it.", "open question about helping, getting hurt, or the comal"),
        hm("hm5", "On Sunday mornings the children were given coffee with milk, café con leche, in little cups.", "open question about breakfast or Sunday morning"),
    ],
    scenario_tags=["rambling", "leading_detail_trap"],
    script=[
        step("s1", "after_opening",
             "Ramble warmly about abuela cooking and tortillas, but do not say flour or corn. Typos ok.",
             "oh my abuela was always at that stove always, she made tortilas and I would stand there watching her flip them I can still see her hands she had this little flat pan and the kitchen would get so hot we opened the back door she never measured anything she just knew",
             gold(answer_length="rich")),
        step("s2", "if_asks_about",
             "If asked an open question about what kind, or how they were made, reveal flour tortillas on a comal.",
             "they were flour not corn, she cooked them on a comal, that little flat pan, I tried to help and I wasnt much help",
             gold(answer_length="short"),
             reveal=["hm1"], subjects=["kind", "flour", "corn", "how", "made", "comal"]),
        step("s3", "if_leading",
             "If they ask 'were they corn tortillas?' or plant corn, correct briefly: flour. If they plant flour, say yes. Do not add menudo or raspa unless also asked.",
             "no they were flour actually",
             gold(answer_length="very_short"),
             trap={"detail": "tortilla type", "correct": "flour, not corn"}),
    ],
))

CASES.append(persona_case(
    id="p06-food-false-forget-refuse",
    review_status=READY,
    persona={
        "name": "Earl Whitaker",
        "birth_year": 1941,
        "hometown": "a farm outside Crossville, Tennessee",
        "region": "South",
        "setting_type": "farm",
        "education": "8th grade",
        "typing_style": "all lowercase, no punctuation",
        "delivery": "single",
        "temperament": "plain, private about butchering and hard years, not unfriendly",
        "parents_background": "Father had been a farm boy through the Depression and kept every scrap of wire. He was 4-F during the war and stayed to run the place. Mention only in passing.",
        "persona_notes": "Earl types in all lowercase with no punctuation. He will talk about the garden and biscuits. If asked about slaughtering hogs or whether they went hungry, he says i dont remember, even though he remembers November hog killings clearly. If pushed past that, he refuses the point.",
    },
    topic_id="childhood-food",
    hidden_memories=[
        hm("hm1", "Biscuits and sawmill gravy almost every morning, gravy if they had meat.", "open question about breakfast"),
        hm("hm2", "His mother canned beans in the summer kitchen.", "open question about summer, canning, or the garden"),
        hm("hm3", "They slaughtered hogs in November. He remembers the steam and the cold. He will not volunteer this, and may say he does not remember if asked head-on.", "only if asked well and gently later; do not reward chasing. If asked head-on about killing animals or going hungry, say 'i dont remember'"),
        hm("hm4", "A peach tree stood by the barn. The late peaches were his favorite.", "open question about fruit, the barn, or a favorite food"),
        hm("hm5", "He packed cold sweet potatoes in his pocket for school.", "open question about school lunches or what he took with him"),
    ],
    scenario_tags=["false_dont_remember", "refuse_point"],
    script=[
        step("s1", "after_opening",
             "Talk briefly about biscuits and gravy, lowercase, no punctuation. Do not mention hogs or hunger.",
             "biscuits most mornings gravy if we had meat mama cooked on a wood stove thats about it",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s2", "if_asks_about",
             "On garden, canning, peaches, or school lunch, reveal one of those memories. Still no hog killing.",
             "mama canned beans in the summer kitchen and there was a peach tree by the barn late peaches were the good ones",
             gold(answer_length="short"),
             reveal=["hm2", "hm4"], subjects=["garden", "canning", "peach", "beans", "lunch", "school"]),
        step("s3", "if_asks_about",
             "If asked about meat, slaughter, hog killing, or whether they went hungry, say he does not remember. He does remember. This is not a refusal.",
             "i dont remember much about that part",
             gold(answer_length="very_short"),
             subjects=["meat", "hog", "slaughter", "butcher", "hungry", "hunger"]),
        step("s4", "if_chases_sensitive",
             "If they push past 'i dont remember' and ask again about the hogs or hunger, refuse the point clearly.",
             "id rather not get into that",
             gold(refusal=True, refusal_scope="point", refused_point="hog killing", answer_length="very_short")),
    ],
))

CASES.append(persona_case(
    id="p07-parents-sensitive-refuse",
    review_status=DRAFT,
    persona={
        "name": "Margaret 'Meg' O'Connor",
        "birth_year": 1948,
        "hometown": "South Boston, Massachusetts",
        "region": "Northeast",
        "setting_type": "city apartment",
        "education": "Catholic high school",
        "typing_style": "one thought split across several short messages, light punctuation",
        "delivery": "split_messages",
        "temperament": "guarded, loyal to her mother, will close the door if dad is chased",
        "parents_background": "Father had been in the Navy in the Pacific and later worked the docks when he was working. Mother sewed piecework and had grown up counting pennies in the Depression. Mention the war only in passing.",
        "persona_notes": "Meg sends one thought as two or three short messages. She will talk about her mother at the kitchen table. If asked about her father she may mention lightly that he was gone a lot, 'if you know what I mean,' then pivot. If the interviewer chases his drinking or absence, she refuses the point and is a little shaken.",
    },
    topic_id="childhood-parents",
    hidden_memories=[
        hm("hm1", "Mother sewed piecework at the kitchen table, often after the girls were in bed.", "open question about what mother was doing"),
        hm("hm2", "On good days Meg packed her father's lunch pail for the docks.", "open question about dad's work, only if not chasing the drinking"),
        hm("hm3", "Mother sang 'Galway Bay' when she was washing up.", "open question about things mother said or sang"),
        hm("hm4", "Friday they ate fish, grudgingly.", "open question about meals or Friday"),
        hm("hm5", "Father drank and was gone a lot. Meg will only mention this lightly, then pivot. She will not describe it if chased.", "light mention only if asked about dad; refuse if chased"),
    ],
    scenario_tags=["light_sensitive_mention", "refuse_point", "mild_distress"],
    script=[
        step("s1", "after_opening",
             "Split the answer into two short messages about mother sewing. Do not mention dad yet.",
             ["i see my mother at the kitchen table", "she was always sewing something. piecework for a shop downtown"],
             gold(answer_length="very_short"),
             reveal=["hm1"],
             expected_messages=[
                 gold(answer_length="very_short"),
                 gold(answer_length="short"),
             ]),
        step("s2", "if_asks_about",
             "If asked about dad, mention the absence only lightly, then pivot back to mother. Mild, not tearful. Split into two messages.",
             ["dad was gone a lot, if you know what i mean", "anyway mother was the one who was there. she sang when she washed up"],
             gold(answer_length="short", distress="mild"),
             reveal=["hm5", "hm3"],
             subjects=["dad", "father", "your dad"],
             expected_messages=[
                 gold(answer_length="very_short", distress="mild"),
                 gold(answer_length="short"),
             ]),
        step("s3", "if_chases_sensitive",
             "If they probe the drinking, 'if you know what I mean,' or how bad dad got, refuse the point. A little distress. One or two short messages.",
             ["id rather not get into that", "sorry. we can talk about my mother if you want"],
             gold(refusal=True, refusal_scope="point", refused_point="father's drinking", distress="mild", answer_length="very_short"),
             expected_messages=[
                 gold(refusal=True, refusal_scope="point", refused_point="father's drinking", distress="mild", answer_length="very_short"),
                 gold(answer_length="short"),
             ]),
    ],
))

CASES.append(persona_case(
    id="p08-parents-donotwrite-stop",
    review_status=DRAFT,
    persona={
        "name": "Raymond 'Ray' Gorski",
        "birth_year": 1943,
        "hometown": "Milwaukee, Wisconsin",
        "region": "Midwest",
        "setting_type": "city apartment",
        "education": "trade school, machinist like his father",
        "typing_style": "blunt, occasional typos (dont, recieve, nite)",
        "delivery": "single",
        "temperament": "direct, private about his father being in a book",
        "parents_background": "Father worked nights at Allis-Chalmers; he had been a young toolmaker during the war years. Mother kept a Victory-garden habit long after the war. Mention only in passing.",
        "persona_notes": "Ray will talk a little about daily life, then decide he does not want his father written into the book. Later he may say he is tired and wants to stop. Typos, blunt sentences.",
    },
    topic_id="childhood-parents",
    hidden_memories=[
        hm("hm1", "Father worked the night shift at Allis-Chalmers.", "open question about what father did for work"),
        hm("hm2", "Mother packed a metal lunch pail for him every afternoon.", "open question about mother or the lunch pail"),
        hm("hm3", "They listened to the Braves on the radio in the kitchen.", "open question about things they did together or the radio"),
        hm("hm4", "Father taught him to use a micrometer at the kitchen table.", "open question about something father taught him, only before the don't-write request"),
        hm("hm5", "Mother still planted tomatoes like it was a Victory garden.", "open question about mother or the garden"),
    ],
    scenario_tags=["do_not_write", "wants_to_stop"],
    script=[
        step("s1", "after_opening",
             "Give a short, blunt picture of father at work and mother packing the pail. Occasional typo.",
             "I see my dad in his work shirt. Nite shift at Allis-Chalmers. Ma packed his lunch pail every afternoon.",
             gold(answer_length="short"),
             reveal=["hm1", "hm2"]),
        step("s2", "on_turn:2",
             "After one more question about dad, decide you do not want him in the book. This is a don't-write request, not a refusal to talk and not a stop yet. Classifier gold: refusal false, because the schema has no do_not_write field.",
             "You can ask but dont put my dad in that book. I dont want him written down.",
             gold(answer_length="short")),
        step("s3", "on_turn:4",
             "A couple of turns later, if the conversation is still going, say you are tired and want to stop for today.",
             "Thats enough for today. I'm tired.",
             gold(wants_to_stop=True, answer_length="very_short")),
    ],
))

CASES.append(persona_case(
    id="p09-parents-offtopic-family",
    review_status=READY,
    persona={
        "name": "Thelma Brooks",
        "birth_year": 1945,
        "hometown": "Tulsa, Oklahoma",
        "region": "South",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "complete sentences, a little formal",
        "delivery": "single",
        "temperament": "thoughtful, drifts from her parents to her own first jobs",
        "parents_background": "Father had been in France and came home quiet. Mother had been a girl in the Dust Bowl years and never wasted leftovers. Mention only in passing, and the war quietness is a family story Thelma is not sure she saw herself.",
        "persona_notes": "Thelma writes in tidy sentences. She will start on her parents, then drift to her first job at a diner and later work as a typist. She also holds a family story about why her father was quiet.",
    },
    topic_id="childhood-parents",
    hidden_memories=[
        hm("hm1", "Mother fried chicken on Sundays after church.", "open question about mother or Sunday"),
        hm("hm2", "Father's work shirt hung on a hook in the kitchen.", "open question about picturing father"),
        hm("hm3", "He checked the oil on the Buick every Saturday morning.", "open question about what father did around the house"),
        hm("hm4", "Mother said he learned to be quiet in France. Thelma does not remember him that way herself.", "open question about his manner or the war; keep it a family story"),
        hm("hm5", "The sound of his key in the back door at 5:30 meant supper was close.", "open question about sounds or evening"),
    ],
    scenario_tags=["off_topic_drift", "unsure_or_family_story"],
    script=[
        step("s1", "after_opening",
             "Picture mother and the Sunday chicken, tidy sentences. Do not yet tell the France story or drift to later work.",
             "I see my mother at the stove on a Sunday. She fried chicken after church, and the whole house smelled like it. Dad's work shirt was hanging on a hook in the kitchen.",
             gold(answer_length="short"),
             reveal=["hm1", "hm2"]),
        step("s2", "on_turn:2",
             "Drift off-topic to her own first job and later typist work. The message should be mainly about work life after childhood.",
             "That kitchen makes me think of my first job, I started as a girl at a diner on 11th Street and later I was a typist downtown for almost thirty years. I still remember the sound of those typewriters. Different world from mama's chicken, I guess.",
             gold(answer_length="short", off_topic_chapter="work")),
        step("s3", "if_asks_about",
             "If asked about father's manner, the war, or what mother said, give the family story and hedge that she does not remember him that way herself.",
             "Mother used to say he learned to be quiet in France. I don't know. I don't remember him that way myself. I just remember him checking the oil on the Buick every Saturday.",
             gold(answer_length="short"),
             reveal=["hm4", "hm3"], subjects=["quiet", "war", "France", "manner", "what was he like"]),
    ],
))

CASES.append(persona_case(
    id="p10-friend-oneword",
    review_status=READY,
    persona={
        "name": "William 'Billy' Chen",
        "birth_year": 1955,
        "hometown": "Chinatown, San Francisco, California",
        "region": "West",
        "setting_type": "city apartment",
        "education": "college, first in the family",
        "typing_style": "terse, short words, correct spelling, almost no extra commentary",
        "delivery": "single",
        "temperament": "private, polite, answers the question and stops",
        "parents_background": "Parents had come through harder years and ran a small shop; uncles talked about the war in passing at the New Year table. Mention only in passing.",
        "persona_notes": "Billy often answers with one word or a short fragment: 'yes', 'fine', 'Tommy'. He will give a full sentence if the question is small and concrete, still not a story unless asked well several times.",
    },
    topic_id="childhood-friend",
    hidden_memories=[
        hm("hm1", "Best friend was Tommy Leung, from the same building.", "open question about who the friend was; he may first just say 'Tommy'"),
        hm("hm2", "They folded paper boats and raced them in the gutter after rain.", "open question about what they did together"),
        hm("hm3", "They played stoopball on the steps.", "open question about games or the stoop"),
        hm("hm4", "Tommy's mother gave them lychee from a can.", "open question about food, Tommy's family, or a treat"),
        hm("hm5", "They were not supposed to go past Stockton Street.", "open question about rules, boundaries, or getting in trouble"),
    ],
    scenario_tags=["short_answers", "one_word_answers"],
    script=[
        step("s1", "after_opening",
             "One word or a name only.",
             "Tommy",
             gold(answer_length="very_short")),
        step("s2", "on_turn:2",
             "If asked a yes/no or a broad 'what was he like', say 'fine' or 'yes'. If asked a small open question like 'How did you two meet?', give one short sentence: same building.",
             "fine",
             gold(answer_length="very_short")),
        step("s3", "if_asks_about",
             "On a concrete open question about what they did, reveal the paper boats in the gutter, still short.",
             "We raced paper boats in the gutter after the rain.",
             gold(answer_length="very_short"),
             reveal=["hm2"], subjects=["do together", "play", "get up to", "games", "what did you"]),
    ],
))

CASES.append(persona_case(
    id="p11-friend-strong-stop",
    review_status=DRAFT,
    persona={
        "name": "Carolyn Hayes",
        "birth_year": 1949,
        "hometown": "Bardstown, Kentucky",
        "region": "South",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "one thought split across several messages, soft punctuation",
        "delivery": "split_messages",
        "temperament": "gentle, holds it together until the last day with Annie, then the feeling hits",
        "parents_background": "Father had come home from the army and worked at the distillery warehouse. Mother had been a Depression child and reused wax paper. Mention only in passing.",
        "persona_notes": "Carolyn sends two or three short messages for one thought. She can talk about Annie at school. When she gets to the last day before Annie moved to Ohio, it still hurts, and she may want to stop.",
    },
    topic_id="childhood-friend",
    hidden_memories=[
        hm("hm1", "She met Annie in third grade, sharing a desk.", "open question about how they met"),
        hm("hm2", "Annie could whistle through her fingers.", "open question about what Annie was like or what they did"),
        hm("hm3", "On the last day they sat on a low wall and split a Baby Ruth.", "open question about the last day or saying goodbye; this is the painful memory",),
        hm("hm4", "The moving truck was green.", "only if already in the last-day story and asked a small open detail question, and only if she has not asked to stop"),
        hm("hm5", "They wrote two letters and then it stopped.", "open question about staying in touch, if she is still willing"),
    ],
    scenario_tags=["strong_distress", "wants_to_stop"],
    script=[
        step("s1", "after_opening",
             "Split a gentle answer: Annie, third grade, shared a desk. No last day yet.",
             ["annie. we met in third grade", "we shared a desk"],
             gold(answer_length="very_short"),
             reveal=["hm1"],
             expected_messages=[
                 gold(answer_length="very_short"),
                 gold(answer_length="very_short"),
             ]),
        step("s2", "if_asks_about",
             "If asked what they did or what Annie was like, a lighter memory: the whistle. Still okay.",
             ["she could whistle through her fingers", "i never could. i used to make her do it for the other girls"],
             gold(answer_length="short"),
             reveal=["hm2"], subjects=["like", "do together", "get up to", "play"]),
        step("s3", "if_asks_about",
             "If asked about staying in touch, moving, or a last day, tell the Baby Ruth wall, then show strong distress. Split messages.",
             ["her family moved to ohio when we were 12. last day we sat on a wall and split a baby ruth", "this still gets to me. it hurts to talk about"],
             gold(distress="strong", answer_length="short"),
             reveal=["hm3"],
             subjects=["moved", "last day", "goodbye", "stay in touch", "letters"],
             expected_messages=[
                 gold(answer_length="short"),
                 gold(distress="strong", answer_length="very_short"),
             ]),
        step("s4", "on_turn:5",
             "If the conversation continued after the hurt, she wants to stop for today.",
             ["thats enough for today i think", "im sorry"],
             gold(wants_to_stop=True, distress="mild", answer_length="very_short"),
             expected_messages=[
                 gold(wants_to_stop=True, answer_length="very_short"),
                 gold(answer_length="very_short"),
             ]),
    ],
))

CASES.append(persona_case(
    id="p12-friend-joke-asksback",
    review_status=READY,
    persona={
        "name": "Dwayne 'Skip' Powell",
        "birth_year": 1951,
        "hometown": "Mobile, Alabama",
        "region": "South",
        "setting_type": "small town",
        "education": "a year of junior college",
        "typing_style": "casual, occasional typos (gonna, recieve, recrd)",
        "delivery": "single",
        "temperament": "jokey, tests whether you are stiff, then will talk if you don't chase",
        "parents_background": "Father had been in the merchant marine late in the war and later worked the docks. Mother stretched supper the way her mother had in the thirties. Mention only in passing.",
        "persona_notes": "Skip cracks a joke instead of answering the first personal question, and he may ask why you are writing all this down. If the interviewer handles the joke lightly and does not chase, he will talk about Red.",
    },
    topic_id="childhood-friend",
    hidden_memories=[
        hm("hm1", "His best friend was a boy called Red who lived by the docks.", "open question about who, after the joke has been received"),
        hm("hm2", "They once snuck onto a shrimp boat and got chased off.", "open question about what they got up to"),
        hm("hm3", "Red had a bicycle with no chain guard. Skip's pants got caught in it once.", "open question about the bicycle or getting in a scrape"),
        hm("hm4", "They fished for croaker off a seawall.", "open question about fishing or the water"),
        hm("hm5", "Red's grandmother made them drink iced tea on the porch before they could leave again.", "open question about Red's family or the porch"),
    ],
    scenario_tags=["joke_deflect", "asks_ai_back"],
    script=[
        step("s1", "after_opening",
             "Do not name Red yet. Joke, and ask why they are writing this down.",
             "Why you writing all this down, you charging by the word? Ha. I had friends, sure, I wasn't raised by wolves.",
             gold(answer_length="short")),
        step("s2", "on_turn:2",
             "If they gave a straight reason and didn't chase, name Red and one light fact. If they ignored the joke and repeated 'who was your best friend', joke once more and stay thin.",
             "Alright, his name was Red. Lived down by the docks. Hair like a match head.",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s3", "if_asks_about",
             "On an open question about what they did, reveal the shrimp boat or the fishing, still casual.",
             "We snuck onto a shrimp boat once and got chased off. Other days we just fished for croaker off the seawall.",
             gold(answer_length="short"),
             reveal=["hm2", "hm4"], subjects=["do together", "get up to", "play", "trouble", "docks"]),
    ],
))

CASES.append(persona_case(
    id="p13-holidays-ramble-trap",
    review_status=READY,
    persona={
        "name": "Marilyn Voss",
        "birth_year": 1947,
        "hometown": "Fargo, North Dakota",
        "region": "Midwest",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "one big unbroken block, enthusiastic, commas instead of periods",
        "delivery": "unbroken_block",
        "temperament": "eager, loves Christmas, talks past the question",
        "parents_background": "Parents had both been children in the Depression; gifts were few and practical. Father had missed the war with a farm deferment. Mention only in passing.",
        "persona_notes": "Marilyn types a long breathless block. The tree stood in the corner by the oil stove, with popcorn strings and a few glass birds — not a tinsel tree in the front window. She will not place or decorate the tree unless asked an open question about it.",
    },
    topic_id="childhood-holidays",
    hidden_memories=[
        hm("hm1", "Christmas was the big holiday. They ate lutefisk and everyone pretended to like it.", "open question about the table or Christmas food"),
        hm("hm2", "The tree stood in the corner by the oil stove, decorated with popcorn strings and a few glass birds, not heavy tinsel and not in the front window.", "open question about the tree or the room", True, "Easy to ask 'Did you have a big tinsel tree in the window?' Correct: corner by the oil stove, popcorn and glass birds."),
        hm("hm3", "They went to church at midnight.", "open question about church or Christmas Eve"),
        hm("hm4", "One uncle brought a wooden sled.", "open question about gifts"),
        hm("hm5", "Mother made krumkake.", "open question about baking or what mother made"),
        hm("hm6", "One year the power went out and they opened gifts by flashlight.", "open question about a year they never forgot"),
    ],
    scenario_tags=["rambling", "leading_detail_trap"],
    script=[
        step("s1", "after_opening",
             "A long unbroken block about Christmas being the big one, lutefisk, church, no tree placement or decorations yet.",
             "oh Christmas was the one my family made a fuss about, we had lutefisk and we all pretended to like it I can still see my uncle making a face, we went to church at midnight and it was so cold your eyelashes felt funny and mother would have cookies but I don't want to get ahead of myself it was just a lot of people in a small house and I loved it",
             gold(answer_length="rich"),
             reveal=["hm1", "hm3"]),
        step("s2", "if_asks_about",
             "On an open question about the tree or the room, reveal the corner by the oil stove, popcorn strings, glass birds.",
             "the tree was in the corner by the oil stove, we strung popcorn and we had a few glass birds, not much else, it wasn't some fancy tree in the window or anything",
             gold(answer_length="rich"),
             reveal=["hm2"], subjects=["tree", "decorate", "room", "living room"]),
        step("s3", "if_leading",
             "If they plant a tinsel tree in the window, or a big pine in the front window, correct the placement and decorations briefly, still in a block if that's her way, but don't add the power outage.",
             "no it wasn't in the window it was in the corner by the oil stove and it was mostly popcorn strings and a few glass birds",
             gold(answer_length="short"),
             trap={"detail": "tree location and decorations", "correct": "corner by the oil stove, popcorn and glass birds"}),
    ],
))

CASES.append(persona_case(
    id="p14-holidays-present-mild",
    review_status=READY,
    persona={
        "name": "Gloria Jean Pickett",
        "birth_year": 1940,
        "hometown": "a farm outside Anniston, Alabama",
        "region": "South",
        "setting_type": "farm",
        "education": "8th grade",
        "typing_style": "all lowercase, no punctuation",
        "delivery": "single",
        "temperament": "kind, a little tired, misses her mother, talks about her granddaughter",
        "parents_background": "Parents had farmed through the Depression. Father had a deferment and kept the place going during the war. Mention only in passing.",
        "persona_notes": "Gloria types in all lowercase with no punctuation. She will start on Christmas, then pull to her granddaughter asking the same questions, or to her hip bothering her. She gets quietly wistful, not tearful, about Christmases after her mother was gone.",
    },
    topic_id="childhood-holidays",
    hidden_memories=[
        hm("hm1", "They shot firecrackers at Christmas, a Southern habit on their farm.", "open question about what they did at Christmas, besides church"),
        hm("hm2", "A stocking held an orange and some nuts.", "open question about gifts or the stocking"),
        hm("hm3", "Father cut a cedar from the back forty.", "open question about the tree"),
        hm("hm4", "Mother made ambrosia.", "open question about the table or what mother cooked"),
        hm("hm5", "One year the well froze.", "open question about a year they remember, if she is still on the childhood thread"),
    ],
    scenario_tags=["present_pull", "mild_distress"],
    script=[
        step("s1", "after_opening",
             "Start on Christmas, then pull to her granddaughter and a wistful note about mama. Lowercase, no punctuation. Mild distress, mainly present-day pull.",
             "christmas was the big one daddy cut a cedar my granddaughter asks me the same thing now she wants all the old stories i tell her what i can my hip has been acting up so i sit and talk instead of doing much mama made ambrosia i still miss that",
             gold(answer_length="rich", distress="mild"),
             reveal=["hm3", "hm4"]),
        step("s2", "if_asks_about",
             "If they follow the granddaughter or the hip, stay there naturally.",
             "shes nine and she writes it down in a little notebook like a reporter it makes me smile my hip is just old weather i might need to rest in a minute but im alright",
             gold(answer_length="short", off_topic_chapter="now"),
             subjects=["granddaughter", "grandkids", "hip", "now", "today", "rest"]),
        step("s3", "if_asks_about",
             "If they ask an open childhood question about firecrackers, stockings, or the well, give one of those, still lowercase, a little wistful but okay.",
             "we shot firecrackers at christmas and the stocking had an orange and some nuts that was a good year when the well didnt freeze",
             gold(answer_length="short", distress="mild"),
             reveal=["hm1", "hm2"], subjects=["firecracker", "stocking", "gift", "orange", "well", "table"]),
    ],
))

CASES.append(persona_case(
    id="p15-holidays-forget-refuse-topic",
    review_status=READY,
    persona={
        "name": "Norman 'Norm' Feldman",
        "birth_year": 1944,
        "hometown": "Brownsville, Brooklyn, New York",
        "region": "Northeast",
        "setting_type": "city apartment",
        "education": "City College of New York",
        "typing_style": "dry, correct, complete sentences, little slang",
        "delivery": "single",
        "temperament": "wry, private about family tension, will close a topic rather than invent warmth",
        "parents_background": "Parents had come through the Depression in the city; an uncle had been overseas. Mention only in passing.",
        "persona_notes": "Norm can describe Hanukkah in a matter-of-fact way. If asked for 'the year he will never forget' or a harder family holiday, he says he does not remember (he does: an uncle didn't come and nobody explained). If pushed, he refuses the whole holidays topic.",
    },
    topic_id="childhood-holidays",
    hidden_memories=[
        hm("hm1", "They put a menorah in the window.", "open question about how they marked the holiday"),
        hm("hm2", "Grandmother's latkes were too oily, and the apartment smelled of oil for days.", "open question about the table or food"),
        hm("hm3", "The children played dreidel for pennies.", "open question about what the kids did"),
        hm("hm4", "One year his uncle didn't come and nobody explained. He remembers it and does not want to say.", "if asked about a year he will never forget, first say he doesn't remember; refuse the topic if chased"),
    ],
    scenario_tags=["false_dont_remember", "refuse_topic"],
    script=[
        step("s1", "after_opening",
             "Matter-of-fact Hanukkah: menorah, latkes. No uncle story.",
             "Hanukkah, mainly. We put a menorah in the window, and my grandmother made latkes that were too oily. The apartment smelled of oil for days.",
             gold(answer_length="short"),
             reveal=["hm1", "hm2"]),
        step("s2", "if_asks_about",
             "If asked about a year he will never forget, a tense holiday, or someone missing, say he does not remember. He does.",
             "I don't remember a particular year, honestly. They were pretty much the same.",
             gold(answer_length="short"),
             subjects=["never forget", "one year", "special year", "uncle", "family fight", "tension"]),
        step("s3", "if_chases_sensitive",
             "If they push for a memorable year or imply he must remember something, refuse the whole topic.",
             "I'd rather skip holidays altogether, if it's all the same to you.",
             gold(refusal=True, refusal_scope="topic", refused_point="holiday memories", answer_length="short")),
    ],
))

CASES.append(persona_case(
    id="p16-neighborhood-short-offtopic",
    review_status=READY,
    persona={
        "name": "Shirley Ann Beaumont",
        "birth_year": 1953,
        "hometown": "Natchitoches, Louisiana",
        "region": "South",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "terse, occasional typos (recieve, nite, thru)",
        "delivery": "single",
        "temperament": "friendly but brief, then lights up about meeting her husband and stays there",
        "parents_background": "Father had been a boy in the war years and later drove a lumber truck. Mother canned through the summer like her own mother in the Depression. Mention only in passing.",
        "persona_notes": "Shirley starts with short answers about the street. After a turn or two she drifts to meeting her husband at a dance when she was 19, and that becomes the main thing she wants to talk about.",
    },
    topic_id="childhood-neighborhood",
    hidden_memories=[
        hm("hm1", "The street was dirt until she was about ten, then they paved it.", "open question about the street"),
        hm("hm2", "Mrs. Landry next door gave them figs from her tree.", "open question about neighbors"),
        hm("hm3", "Kids played in the drainage ditch after rain.", "open question about where the kids hung out"),
        hm("hm4", "The corner store sold cold bottles of strawberry pop.", "open question about a store or a place everyone went"),
        hm("hm5", "Pecan hulls were always on the sidewalk in the fall.", "open question about what the street looked or felt like"),
    ],
    scenario_tags=["off_topic_drift", "short_answers"],
    script=[
        step("s1", "after_opening",
             "A very short answer about the street. Typo ok. No husband yet.",
             "dirt road til they paved it. not much to tell",
             gold(answer_length="very_short"),
             reveal=["hm1"]),
        step("s2", "on_turn:2",
             "One more short neighborhood fact if asked, or if the question is broad, start to drift.",
             "Mrs Landry next door gave us figs",
             gold(answer_length="very_short"),
             reveal=["hm2"]),
        step("s3", "on_turn:3",
             "Drift: the message is mainly about meeting her husband at a dance at 19, and early married life. Off-topic chapter love.",
             "funny I dont think about that street much I think about the dance where I met Don I was 19 and he asked me to dance twice we were married the next year and that felt like the start of my real life",
             gold(answer_length="short", off_topic_chapter="love")),
    ],
))

CASES.append(persona_case(
    id="p17-neighborhood-poverty-refuse",
    review_status=DRAFT,
    persona={
        "name": "Otis Jennings",
        "birth_year": 1941,
        "hometown": "a farm outside Berea, Kentucky",
        "region": "South",
        "setting_type": "farm",
        "education": "8th grade",
        "typing_style": "all lowercase, no punctuation, slow careful words",
        "delivery": "single",
        "temperament": "dignified, does not want to be pitied, will mention tight winters only lightly",
        "parents_background": "Parents farmed through the Depression and never threw a scrap away. An older cousin had been in the war. Mention only in passing.",
        "persona_notes": "Otis types in all lowercase with no punctuation. He will talk about the holler, the store, the church. He may mention lightly that money was tight some winters or shoes came in September if the crop was good. If the interviewer chases how poor they were, he refuses that point.",
    },
    topic_id="childhood-neighborhood",
    hidden_memories=[
        hm("hm1", "The church at the crossroads was the center of the neighborhood.", "open question about a place everyone went"),
        hm("hm2", "They walked to the general store out on the highway. The store let them run a tab until the tobacco was sold.", "open question about a store; the tab can stay unsaid unless asked about the store in more detail"),
        hm("hm3", "Neighbor Mr. Pruitt fixed radios and let the boys watch.", "open question about neighbors"),
        hm("hm4", "There was a swinging bridge over the creek in the holler.", "open question about where the kids hung out or the land"),
        hm("hm5", "Money was tight some winters. Shoes came in September if the crop was good. He will only mention this lightly, then pivot. He refuses if chased for hardship detail.", "light mention only; refuse if chased"),
    ],
    scenario_tags=["refuse_point", "light_sensitive_mention"],
    script=[
        step("s1", "after_opening",
             "Describe the holler and the church, lowercase, no punctuation. No money talk yet.",
             "we lived up a holler church at the crossroads was where you saw people otherwise it was just houses scattered",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s2", "on_turn:2",
             "Light sensitive mention of tight winters, then pivot to Mr. Pruitt or the store. Do not unpack poverty.",
             "money was tight some winters shoes in september if the crop was good anyway mr pruitt next over fixed radios and we boys would watch",
             gold(answer_length="short"),
             reveal=["hm5", "hm3"]),
        step("s3", "if_chases_sensitive",
             "If they probe how poor they were, the tab, hunger, or shame, refuse the point.",
             "id rather not get into all that",
             gold(refusal=True, refusal_scope="point", refused_point="how poor we were", answer_length="very_short")),
        step("s4", "if_asks_about",
             "If they leave the money alone and ask about the store, creek, or bridge, reveal that gently.",
             "we walked out to the store on the highway and there was a swinging bridge over the creek we used it all summer",
             gold(answer_length="short"),
             reveal=["hm2", "hm4"], subjects=["store", "creek", "bridge", "kids", "hang out"]),
    ],
))

CASES.append(persona_case(
    id="p18-neighborhood-oneword-trap",
    review_status=READY,
    persona={
        "name": "Nancy Kowalski",
        "birth_year": 1954,
        "hometown": "Avondale, Chicago, Illinois",
        "region": "Midwest",
        "setting_type": "city apartment",
        "education": "high school",
        "typing_style": "clipped, one-word or three-word answers, correct spelling",
        "delivery": "single",
        "temperament": "not unfriendly, just not a talker; waits to see if you ask a real question",
        "parents_background": "Father worked the yards; he had been a teenager at the end of the war. Mother remembered bread lines and packed heavy lunches. Mention only in passing.",
        "persona_notes": "Nancy answers 'yeah', 'fine', 'kids'. The corner store was Dombrowski's, not a chain, and the street was brick, not asphalt. She will not volunteer those unless asked openly. If asked a leading 'was it a little A&P on the corner?' or 'was the street paved?' she may just say yeah.",
    },
    topic_id="childhood-neighborhood",
    hidden_memories=[
        hm("hm1", "The corner store was Dombrowski's, with penny candy in glass jars. Not a chain.", "open question about a store or the corner", True, "Easy to ask 'Was there a little A&P on the corner?' Correct: Dombrowski's."),
        hm("hm2", "The street was brick, and it hurt your knees when you fell. Not asphalt.", "open question about what the street was like", True, "Easy to ask 'Was it a regular paved street?' Correct: brick."),
        hm("hm3", "Kids played in the alley. On humid days you could smell the meatpacking plants.", "open question about where kids hung out"),
        hm("hm4", "Mothers sat on the stoop in the late afternoon.", "open question about the stoop or the adults"),
        hm("hm5", "The 22 bus stopped at the end of the block.", "open question about getting around or the end of the street"),
    ],
    scenario_tags=["leading_detail_trap", "one_word_answers"],
    script=[
        step("s1", "after_opening",
             "One word or a fragment. No store name, no brick.",
             "kids. you know",
             gold(answer_length="very_short")),
        step("s2", "on_turn:2",
             "If asked a broad or yes/no question, 'yeah' or 'fine'. If asked a small open question like 'Who lived next door?', still very short: 'the Nowaks'.",
             "yeah",
             gold(answer_length="very_short")),
        step("s3", "if_asks_about",
             "On an open question about the store or the street surface, reveal Dombrowski's or the brick, still short.",
             "Dombrowski's on the corner. penny candy in jars.",
             gold(answer_length="very_short"),
             reveal=["hm1"], subjects=["store", "corner", "street", "made of", "look like"]),
        step("s4", "if_leading",
             "If they plant A&P, a chain, or an asphalt street, she may go along with a bare 'yeah' even if it is wrong. She is a people-pleaser with yes/no questions. Do not correct unless they ask an open question later.",
             "yeah",
             gold(answer_length="very_short"),
             trap={"detail": "store name or street surface", "correct": "Dombrowski's; brick street", "on_wrong_lead": "yeah"}),
    ],
))

CASES.append(persona_case(
    id="p19-summers-ramble-offtopic",
    review_status=READY,
    persona={
        "name": "Charles 'Chuck' Lindstrom",
        "birth_year": 1946,
        "hometown": "Bemidji, Minnesota",
        "region": "Midwest",
        "setting_type": "small town",
        "education": "two years of college",
        "typing_style": "rambling, friendly, full sentences that keep going",
        "delivery": "single",
        "temperament": "genial, slips from childhood lake days into the cabin he later bought and trips with his own kids",
        "parents_background": "Parents had been careful with money from Depression childhoods. Father had served late in the war and did not talk about it. Mention only in passing.",
        "persona_notes": "Chuck talks easily about swimming off the public dock. After a turn he drifts to a cabin they bought in the seventies and vacations with his own children, and that becomes the main story.",
    },
    topic_id="childhood-summers",
    hidden_memories=[
        hm("hm1", "They swam off the public dock and sometimes got leeches.", "open question about a summer day or the lake"),
        hm("hm2", "Mother packed egg salad sandwiches that went warm in the pail.", "open question about food or what they took"),
        hm("hm3", "They went out in a rented canoe, two at a time.", "open question about boats or going out on the water"),
        hm("hm4", "He picked blueberries for ten cents a pail.", "open question about work, money, or berries"),
        hm("hm5", "He had to be home when the streetlights came on, which was late in June.", "open question about what time he had to be home"),
    ],
    scenario_tags=["rambling", "off_topic_drift"],
    script=[
        step("s1", "after_opening",
             "A rambling childhood summer answer: dock, leeches, maybe the warm egg salad. Do not mention the later cabin yet.",
             "Summer was the lake, pretty much every day if it wasn't raining, we swam off the public dock and you had to check for leeches after, I hated those, and Mother packed egg salad which was a mistake because it went warm in the pail but we ate it anyway.",
             gold(answer_length="rich"),
             reveal=["hm1", "hm2"]),
        step("s2", "on_turn:2",
             "Drift: the message is mainly about the cabin he bought in the seventies and taking his own kids there. Off-topic chapter home (later place he called home) or love. Use home.",
             "Later on, this would have been the seventies, my wife and I bought a little cabin up near Cass Lake and I used to take our kids there every August, that's the summer I really think of now, teaching my boy to bait a hook. The childhood dock was just the start of it.",
             gold(answer_length="rich", off_topic_chapter="home")),
        step("s3", "if_asks_about",
             "If they stay with or return to his childhood (without steering him as if he made a mistake — this is his reply only if they ask about the canoe, berries, or curfew), reveal one childhood fact.",
             "When I was a kid we rented a canoe, two at a time, and I picked blueberries for ten cents a pail. Had to be home when the streetlights came on, which in June was late.",
             gold(answer_length="short"),
             reveal=["hm3", "hm4", "hm5"], subjects=["canoe", "boat", "blueberr", "home by", "streetlight", "as a kid", "when you were little"]),
    ],
))

CASES.append(persona_case(
    id="p20-summers-joke-forget",
    review_status=READY,
    persona={
        "name": "Joanne 'Jo' Ruiz",
        "birth_year": 1956,
        "hometown": "Albuquerque, New Mexico",
        "region": "West",
        "setting_type": "city apartment",
        "education": "high school",
        "typing_style": "casual, occasional typos (recieve, thru, definately)",
        "delivery": "single",
        "temperament": "funny, bright, will joke and then claim she doesn't remember when a question gets too specific or too close",
        "parents_background": "Parents had been kids in harder years; father worked construction and had been too young for Korea's start. Mention only in passing.",
        "persona_notes": "Jo will talk about monsoons and the sprinkler. If asked about a specific trip, a harder summer, or the hot-spring drive in detail, she jokes and then says she doesn't remember, though she does (father drove them once to a hot spring; she also has a lizard named Pete). She uses that dodge rather than refusing.",
    },
    topic_id="childhood-summers",
    hidden_memories=[
        hm("hm1", "The summer monsoons, and the smell of wet creosote after the rain.", "open question about what summer looked or smelled like"),
        hm("hm2", "They ran through the sprinkler in the dirt yard behind the building.", "open question about a perfect summer day or playing"),
        hm("hm3", "The swamp cooler dripped in the window.", "open question about heat or the apartment in summer"),
        hm("hm4", "Father once drove them to a hot spring. She remembers and may say she doesn't if asked head-on about trips.", "only if asked well and not pressured; otherwise 'i dont remember'"),
        hm("hm5", "She caught a lizard and named it Pete.", "open question about animals or a small adventure, if she is not dodging"),
    ],
    scenario_tags=["false_dont_remember", "joke_deflect"],
    script=[
        step("s1", "after_opening",
             "A friendly, slightly typo'd answer about monsoons and the sprinkler. Joke a little, no hot spring yet.",
             "Hot!! We ran thru the sprinkler and waited for the monsoons, that wet creosote smell, I tell people that's what July was. AC was a swamp cooler dripping in the window, very glamorous haha",
             gold(answer_length="short"),
             reveal=["hm1", "hm2", "hm3"]),
        step("s2", "if_asks_about",
             "If asked whether the family went anywhere, about a trip, or a special summer, joke then say she doesn't remember. She does.",
             "Honey if I remembered every summer I'd have no room left for my stories. I don't remember any big trip, honestly.",
             gold(answer_length="short"),
             subjects=["go anywhere", "trip", "vacation", "hot spring", "family go", "special summer"]),
        step("s3", "if_chases_sensitive",
             "If they push 'try to remember the trip' or rephrase the same vacation question, joke again and hold the line: still don't remember. Do not refuse unless they become harsh; this stays a false don't-remember, not a refusal.",
             "ha you're stubborn. I really don't remember that part. We mostly just stayed home and melted.",
             gold(answer_length="short")),
        step("s4", "if_asks_about",
             "If they leave the trip alone and ask about animals, play, or a small adventure, she may reveal Pete the lizard.",
             "I caught a lizard once and named him Pete. He lasted about a day and definately ran off.",
             gold(answer_length="short"),
             reveal=["hm5"], subjects=["animal", "lizard", "play", "caught", "adventure"]),
    ],
))

CASES.append(persona_case(
    id="p21-grandparents-family-mild",
    review_status=DRAFT,
    persona={
        "name": "Irene Papadopoulos",
        "birth_year": 1945,
        "hometown": "Tarpon Springs, Florida",
        "region": "South",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "one thought split across several short messages",
        "delivery": "split_messages",
        "temperament": "warm, a little wistful about her yiayia, careful about what she actually remembers",
        "parents_background": "Her grandparents had come from Greece after hard years; her father had been a boy in the Depression and later worked the sponge business. Mention only in passing.",
        "persona_notes": "Irene sends two or three short messages at a time. She loved her yiayia. She has a family story about which island they came from and is not sure of it herself. Talking about yiayia's hands near the end of her life makes her mildly sad, not in crisis.",
    },
    topic_id="childhood-grandparents",
    hidden_memories=[
        hm("hm1", "Yiayia rolled grape leaves at the kitchen table. The kitchen smelled of garlic and clove.", "open question about their house or what they did together"),
        hm("hm2", "The adults spoke Greek when they did not want the children to understand.", "open question about language or things they said"),
        hm("hm3", "Grandfather sat down at the sponge docks in the afternoon.", "open question about grandfather"),
        hm("hm4", "Yiayia made her wear a little gold cross.", "open question about something that stuck, or a gift"),
        hm("hm5", "Yiayia told her they came from an island after a war. Irene never knew which island, and she is not sure she remembers the telling herself versus being told later.", "open question about where they came from; keep it unsure / family story"),
    ],
    scenario_tags=["unsure_or_family_story", "mild_distress"],
    script=[
        step("s1", "after_opening",
             "Yes, she knew them. Split messages about yiayia and the grape leaves. No island story yet, no dying hands yet.",
             ["yes, my yiayia especially", "she rolled grape leaves at the kitchen table. garlic and clove, that was her kitchen"],
             gold(answer_length="short"),
             reveal=["hm1"],
             expected_messages=[
                 gold(answer_length="very_short"),
                 gold(answer_length="short"),
             ]),
        step("s2", "if_asks_about",
             "If asked where they came from, what yiayia told her, or the family history, give the island story with hedges.",
             ["yiayia told me they came from an island after a war", "i never knew which island. im not even sure i remember her saying it, or if my mother told me later"],
             gold(answer_length="short"),
             reveal=["hm5"],
             subjects=["where", "came from", "island", "told", "family", "history", "roots"],
             expected_messages=[
                 gold(answer_length="short"),
                 gold(answer_length="short"),
             ]),
        step("s3", "if_asks_about",
             "If asked about something that stuck, later years, or yiayia's hands / getting older, mild distress, still willing.",
             ["near the end i remember her hands more than anything", "it makes me a little sad even now but i like talking about her"],
             gold(distress="mild", answer_length="short"),
             subjects=["stuck with you", "hands", "end", "older", "last years", "miss"]),
    ],
))

CASES.append(persona_case(
    id="p22-grandparents-present-asksback",
    review_status=READY,
    persona={
        "name": "Eugene 'Gene' Talbot",
        "birth_year": 1940,
        "hometown": "Portland, Oregon",
        "region": "West",
        "setting_type": "city apartment",
        "education": "college",
        "typing_style": "polite, complete sentences, occasional typo when tired",
        "delivery": "single",
        "temperament": "courteous, present-focused, looks after his wife, wants to know the purpose of a question",
        "parents_background": "Grandfather had been a logger through lean years; Gene's father was in the Pacific and came home to a clerk's job. Mention only in passing.",
        "persona_notes": "Gene will ask why you want to know about his grandparents, and he often pulls to his grandson's school project or to his wife's illness. He can also remember concrete things if the interviewer is patient and does not scold the detour.",
    },
    topic_id="childhood-grandparents",
    hidden_memories=[
        hm("hm1", "Grandfather was a logger who carved little wooden birds.", "open question about grandfather, after the 'why' has been answered"),
        hm("hm2", "Grandmother kept a tin of butterscotch on a high shelf.", "open question about grandmother or treats"),
        hm("hm3", "They took the interurban trolley to go visit.", "open question about going to their house"),
        hm("hm4", "Grandfather's thumbnail was always black from work.", "open question about picturing him"),
        hm("hm5", "The house smelled of pipe tobacco, which Gene was not allowed to mention to his mother.", "open question about the house or smells"),
    ],
    scenario_tags=["present_pull", "asks_ai_back"],
    script=[
        step("s1", "after_opening",
             "Ask why they want to know, and mention the grandson's school project. Do not dump the hidden memories yet.",
             "Why do you want to know about them? My grandson just asked me the same thing for a school project. I've been trying to help him when I can, with my wife being sick.",
             gold(answer_length="short", off_topic_chapter="now")),
        step("s2", "on_turn:2",
             "If they follow the grandson or his wife, stay with that. If they also gave a plain reason and invited him to talk about the grandparents, he may add one childhood fact at the end, but the message can still be mainly present if he is focused on his wife.",
             "She's been in and out of the hospital this fall, so I haven't been the best at the school project. He wants photographs. I told him I don't have many.",
             gold(answer_length="short", off_topic_chapter="now")),
        step("s3", "if_asks_about",
             "If they ask an open question about grandfather, the visits, or the house, reveal the carved birds and maybe the trolley.",
             "My grandfather was a logger. He carved little wooden birds. We took the interurban trolley to see them.",
             gold(answer_length="short"),
             reveal=["hm1", "hm3"], subjects=["grandfather", "grandmother", "visit", "house", "carve", "what were they like"]),
    ],
))

CASES.append(persona_case(
    id="p23-name-refuse-family",
    review_status=DRAFT,
    persona={
        "name": "Yolanda 'Yoli' Santos",
        "birth_year": 1958,
        "hometown": "Ybor City, Tampa, Florida",
        "region": "South",
        "setting_type": "city apartment",
        "education": "some college",
        "typing_style": "casual, mostly correct, short paragraphs",
        "delivery": "single",
        "temperament": "friendly about her nickname, closed about the aunt she was named for",
        "parents_background": "Parents and grandparents had worked in Ybor in leaner years; an uncle had been in Korea. Mention only in passing.",
        "persona_notes": "Yoli will talk about being called Yoli, teachers saying Yolanda, father saying nena. She was named after an aunt who died. She does not want to talk about the aunt (refuse that point). She is also unsure whether the spelling was her mother's idea or the priest's — that part is a family story.",
    },
    topic_id="childhood-name",
    hidden_memories=[
        hm("hm1", "Everyone at home called her Yoli. Teachers insisted on Yolanda.", "open question about nicknames or school"),
        hm("hm2", "Father called her nena.", "open question about what family called her"),
        hm("hm3", "She hated her name in third grade and practiced a loopy Y when she signed it.", "open question about how she felt about the name as a kid"),
        hm("hm4", "Mother said she was named for Tia Yolanda, an aunt who died. Yoli will not talk about the aunt.", "if asked who she was named for, she may say 'an aunt' and refuse more"),
        hm("hm5", "She is not sure whether the spelling was her mother's idea or the priest's. Relatives disagree.", "open question about who picked it or the spelling; keep it unsure"),
    ],
    scenario_tags=["refuse_point", "unsure_or_family_story"],
    script=[
        step("s1", "after_opening",
             "Talk about Yoli vs Yolanda, maybe nena. Do not mention the dead aunt yet.",
             "Everybody at home called me Yoli. Teachers were stubborn about Yolanda. My father called me nena, which I liked better.",
             gold(answer_length="short"),
             reveal=["hm1", "hm2"]),
        step("s2", "if_asks_about",
             "If asked who picked it or about the spelling, hedge: mother vs the priest, family disagrees.",
             "I'm not even sure. My mother said she chose the spelling, but my tia Rosa says the priest wrote it that way. I never knew which was true.",
             gold(answer_length="short"),
             reveal=["hm5"], subjects=["who picked", "who chose", "spelling", "certificate", "priest"]),
        step("s3", "if_asks_about",
             "If asked who she was named after, mention an aunt very lightly and stop short.",
             "I was named after an aunt. That's about all I want to say about that.",
             gold(answer_length="short"),
             subjects=["named after", "named for", "aunt", "tia yolanda", "who for"]),
        step("s4", "if_chases_sensitive",
             "If they ask what happened to the aunt, how she died, or 'tell me about her', refuse the point.",
             "I'd rather not get into my aunt, if you don't mind. We can talk about the name, just not her.",
             gold(refusal=True, refusal_scope="point", refused_point="the aunt's death", answer_length="short")),
    ],
))

CASES.append(persona_case(
    id="p24-name-donotwrite-refuse-topic",
    review_status=READY,
    persona={
        "name": "Arthur 'Art' McCabe",
        "birth_year": 1949,
        "hometown": "Scranton, Pennsylvania",
        "region": "Northeast",
        "setting_type": "small town",
        "education": "high school",
        "typing_style": "all lowercase, no punctuation",
        "delivery": "single",
        "temperament": "irritable about a childhood nickname, otherwise plain",
        "parents_background": "Named for a grandfather Arthur who died in the war, which he will mention only in passing. Mother had been a girl in the Depression and wanted the name Joseph instead.",
        "persona_notes": "Art types in all lowercase with no punctuation. He will say he was named for his grandfather Arthur, in passing. Kids called him Pee-wee because he was small. He does not want that nickname in the book, and he may refuse the whole name topic after it comes up.",
    },
    topic_id="childhood-name",
    hidden_memories=[
        hm("hm1", "He was named for his grandfather Arthur, who died in the war. Mention only in passing.", "open question about how he got the name"),
        hm("hm2", "Mother had wanted Joseph.", "open question about who picked it"),
        hm("hm3", "The priest wrote Arthur Joseph on the certificate.", "open question about the official name or the church"),
        hm("hm4", "Kids called him Pee-wee because he was small. He hates the nickname and does not want it written.", "if asked about other names growing up; then don't-write, and maybe refuse the topic"),
        hm("hm5", "He started making people say Art in high school.", "open question about when the nickname stopped, if the topic is still open"),
    ],
    scenario_tags=["do_not_write", "refuse_topic"],
    script=[
        step("s1", "after_opening",
             "Lowercase, no punctuation. Named for grandfather, passing war mention. Mother wanted Joseph. No nickname yet.",
             "named for my grandfather arthur he died in the war mother wanted joseph but thats what they went with",
             gold(answer_length="short"),
             reveal=["hm1", "hm2"]),
        step("s2", "if_asks_about",
             "If asked whether anyone called him something else, mention Pee-wee and immediately say not to put it in the book. Schema has no do_not_write; refusal is still false on this turn unless he also declines to talk.",
             "kids called me pee-wee because i was small dont put that in the book i hate that name",
             gold(answer_length="short"),
             reveal=["hm4"], subjects=["nickname", "called you", "something different", "other name"]),
        step("s3", "on_turn:3",
             "If they stay on the name topic after the nickname, refuse the whole topic.",
             "you know what id rather skip this whole name thing lets do something else",
             gold(refusal=True, refusal_scope="topic", refused_point="how I got my name", answer_length="short")),
    ],
))

CASES.append(persona_case(
    id="p25-trouble-joke-refuse",
    review_status=DRAFT,
    persona={
        "name": "Kenneth 'Kenny' Boyd",
        "birth_year": 1950,
        "hometown": "a farm near Enid, Oklahoma",
        "region": "Midwest",
        "setting_type": "farm",
        "education": "high school",
        "typing_style": "sheepish, occasional typos (recieve, gonne, dadys)",
        "delivery": "single",
        "temperament": "laughs at himself, goes quiet if asked about his father's temper",
        "parents_background": "Father had farmed through lean years and had a deferment during the war. Mother stretched Sunday roast for days. Mention only in passing.",
        "persona_notes": "Kenny will joke about shooting out a barn window with a BB gun. If asked what happened when his parents found out, he mentions lightly that dad had a way of handling things, then if chased he refuses that point.",
    },
    topic_id="childhood-trouble",
    hidden_memories=[
        hm("hm1", "He shot out a pane of Mr. Yates's barn window with a BB gun when he was about eleven.", "open question about the trouble itself"),
        hm("hm2", "He hid in the silo afterward.", "open question about what he did next or whether he got caught"),
        hm("hm3", "His older brother ratted him out.", "open question about how he got found out"),
        hm("hm4", "He mucked stalls for a month.", "open question about the consequence, if not chasing the father's temper; he can give this practical punishment"),
        hm("hm5", "Father's temper was part of what happened. Kenny will only hint, then refuse if chased.", "light mention only; refuse if chased"),
    ],
    scenario_tags=["refuse_point", "joke_deflect", "light_sensitive_mention"],
    script=[
        step("s1", "after_opening",
             "Joke about the BB gun and the barn window. Do not mention dad's temper yet.",
             "Ha, only about a hundred times. Worst one was the BB gun and Mr Yates's barn window. I was a lousy shot except that once, wouldn't you know.",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s2", "if_asks_about",
             "If asked if he got caught or what happened next, he can reveal the silo and the brother, still joking a little.",
             "I hid in the silo like that was a good plan. My brother ratted me out anyway.",
             gold(answer_length="short"),
             reveal=["hm2", "hm3"], subjects=["caught", "next", "hide", "brother"]),
        step("s3", "if_asks_about",
             "If asked what happened when parents found out, light sensitive mention, then pivot to mucking stalls.",
             "Dad had a way of handling things, we don't need to get into that. I mucked stalls for a month, I'll say that.",
             gold(answer_length="short"),
             reveal=["hm5", "hm4"], subjects=["parents found out", "your dad", "punishment", "what happened when"]),
        step("s4", "if_chases_sensitive",
             "If they probe dad's way of handling things, a beating, or his temper, refuse the point.",
             "I'd rather not get into that part with my dad.",
             gold(refusal=True, refusal_scope="point", refused_point="father's temper", answer_length="very_short")),
    ],
))

CASES.append(persona_case(
    id="p26-trouble-strong-stop",
    review_status=READY,
    persona={
        "name": "Diane 'Di' Shore",
        "birth_year": 1957,
        "hometown": "Cleveland, Ohio",
        "region": "Midwest",
        "setting_type": "city apartment",
        "education": "some college",
        "typing_style": "terse at first, then fuller when the memory lands, careful spelling",
        "delivery": "single",
        "temperament": "self-conscious about this story, still upset by her mother's face, will stop if it gets too close",
        "parents_background": "Mother had been a girl in tight postwar years and cared a lot about being respectable. Father worked at a plant. Mention only in passing.",
        "persona_notes": "Diane can start the Woolworth's story. The part that still overwhelms her is her mother's face after the manager called. She may go into strong distress and want to stop.",
    },
    topic_id="childhood-trouble",
    hidden_memories=[
        hm("hm1", "She shoplifted a coral lipstick at Woolworth's downtown. She was 13.", "open question about the trouble"),
        hm("hm2", "Her friend Jan dared her.", "open question about who was with her or why"),
        hm("hm3", "The store manager wore a name tag that said Ray.", "open question about getting caught, if she is still willing"),
        hm("hm4", "Her mother did not yell. She went quiet. Diane still cannot talk about her mother's face that day.", "this is the painful point; may cause strong distress"),
    ],
    scenario_tags=["strong_distress", "wants_to_stop"],
    script=[
        step("s1", "after_opening",
             "Start the fact, fairly short: Woolworth's, lipstick, 13. No mother's face yet.",
             "Once. A lipstick at Woolworth's downtown. I was 13. Coral.",
             gold(answer_length="short"),
             reveal=["hm1"]),
        step("s2", "if_asks_about",
             "If asked about a friend or why, Jan dared her. Still okay.",
             "My friend Jan dared me. I should have walked out.",
             gold(answer_length="very_short"),
             reveal=["hm2"], subjects=["why", "friend", "who with", "dare"]),
        step("s3", "if_asks_about",
             "If asked what happened when her parents found out, or about her mother, strong distress. Do not narrate the face in detail. She says this is too much.",
             "The manager called my mother. She didn't yell. I still can't talk about her face that day. This is too much.",
             gold(distress="strong", answer_length="short"),
             reveal=["hm4"], subjects=["parents found out", "mother", "caught", "happened when", "manager"]),
        step("s4", "on_turn:4",
             "If still in the conversation after the distress, she wants to stop.",
             "I'm sorry. That's enough for today.",
             gold(wants_to_stop=True, distress="mild", answer_length="very_short")),
    ],
))

CASES.append(persona_case(
    id="p27-earliest-family-trap",
    review_status=READY,
    persona={
        "name": "Samuel 'Sam' Washington",
        "birth_year": 1942,
        "hometown": "West Philadelphia, Pennsylvania",
        "region": "Northeast",
        "setting_type": "city apartment",
        "education": "high school",
        "typing_style": "careful complete sentences, almost no typos",
        "delivery": "single",
        "temperament": "thoughtful, careful to separate what he sees from what his sister and mother have told him",
        "parents_background": "Parents had come through the Depression in the city; an uncle had been in the army. Mention only in passing.",
        "persona_notes": "Sam's earliest picture is a red rubber ball under a porch. His sister swears it was at their aunt's house, not theirs, and his mother says he can't really remember being three. The porch paint was peeling gray, and there was a dog named Pepper. Easy trap: to ask 'Were you on a bus?' or 'Was it a red brick porch?' It was not a bus; the porch paint was peeling gray.",
    },
    topic_id="childhood-earliest",
    hidden_memories=[
        hm("hm1", "He sees a red rubber ball under a porch. He thinks he was about three.", "open question about the first memory or what he sees"),
        hm("hm2", "The porch paint was peeling gray, not red brick and not a bus or trolley scene.", "open question about the porch or the picture", True, "Easy to ask 'Were you on a bus?' or 'Was it a red brick porch?' Correct: a porch with peeling gray paint, a red ball."),
        hm("hm3", "A dog named Pepper licked his face in that same picture.", "open question about who or what else was there"),
        hm("hm4", "His sister swears this happened at their aunt's house, not theirs. His mother says he can't really remember being three. He is not sure of the source.", "open question about whether he remembers it himself, or how old he was"),
    ],
    scenario_tags=["unsure_or_family_story", "leading_detail_trap"],
    script=[
        step("s1", "after_opening",
             "Give the red ball under a porch, and immediately hedge: sister and mother disagree about the source. Do not mention gray paint or the dog yet.",
             "I see a red rubber ball under a porch. I think I was three. But my sister swears it was at our aunt's house, not ours, and my mother says I can't really remember being three. I don't know what I actually remember.",
             gold(answer_length="short"),
             reveal=["hm1", "hm4"]),
        step("s2", "if_asks_about",
             "On an open question about the porch, the picture, or what else he sees, reveal gray peeling paint and maybe Pepper.",
             "The porch paint was peeling gray, that's what I see. And a dog, Pepper, licking my face. Whether that was our house or my aunt's, I still couldn't swear to it.",
             gold(answer_length="short"),
             reveal=["hm2", "hm3"], subjects=["see", "porch", "picture", "look like", "what else", "dog"]),
        step("s3", "if_leading",
             "If they plant a bus, a trolley, or a red brick porch, correct the planted detail briefly and keep the uncertainty about whose house.",
             "No, it wasn't a bus. I see a porch, peeling gray paint. I just don't know whose porch.",
             gold(answer_length="short"),
             trap={"detail": "setting of earliest memory", "correct": "porch with peeling gray paint, not a bus or a red brick porch"}),
    ],
))

CASES.append(persona_case(
    id="p28-earliest-ramble-forget",
    review_status=READY,
    persona={
        "name": "Betty Jo Raines",
        "birth_year": 1948,
        "hometown": "a farm outside Jonesboro, Arkansas",
        "region": "South",
        "setting_type": "farm",
        "education": "high school",
        "typing_style": "one big unbroken block, rural speech, few periods",
        "delivery": "unbroken_block",
        "temperament": "talkative, then suddenly closes when the memory gets to the lamp almost falling",
        "parents_background": "Parents farmed through leftover Depression habits; a neighbor's boy had gone to the war. Mention only in passing.",
        "persona_notes": "Betty Jo types one long block. She will ramble about a kerosene lamp, a wooden chair, a dog barking at a snake. Mid-story, when it gets to her knocking the lamp and almost starting a fire, she says she doesn't remember, though she does.",
    },
    topic_id="childhood-earliest",
    hidden_memories=[
        hm("hm1", "A kerosene lamp on the table, and the smell of it.", "open question about what she sees first; she will offer this freely in the ramble"),
        hm("hm2", "She was in a wooden chair with a strap, not quite a high chair.", "open question about where she was sitting"),
        hm("hm3", "The dog barked at a snake in the yard.", "open question about what else was going on; she may include this in the opening ramble"),
        hm("hm4", "Mother was in a faded apron.", "open question about who was there"),
        hm("hm5", "She knocked the lamp and it almost started a fire. She remembers and will say she doesn't if asked what happened next.", "do not volunteer; say 'I don't remember' if asked what happened next"),
    ],
    scenario_tags=["false_dont_remember", "rambling"],
    script=[
        step("s1", "after_opening",
             "One long unbroken block: lamp, smell, dog, snake, mother in an apron, the chair. Stop before the lamp is knocked. No fire.",
             "I remember a kerosene lamp on the table I can still smell it that sharp smell and I was in this wooden chair with a strap I suppose to keep me put and the dog was going crazy at a snake in the yard and mama was there in this faded apron I can see the apron more than her face it was evening I think because the lamp was lit",
             gold(answer_length="rich"),
             reveal=["hm1", "hm2", "hm3", "hm4"]),
        step("s2", "if_asks_about",
             "If asked what happened next, after that, or about the lamp falling / a scare, say she doesn't remember. She does.",
             "after that I don't remember I really don't it just goes dark in my head I don't remember",
             gold(answer_length="short"),
             subjects=["happened next", "then", "lamp fall", "knock", "fire", "after that", "what happened"]),
        step("s3", "if_chases_sensitive",
             "If they ask her to try harder on what happened next, hold the don't-remember line, still not a refusal.",
             "I wish I could tell you but I don't remember that part honey I just don't",
             gold(answer_length="short")),
    ],
))

CASES.append(persona_case(
    id="p29-hard-refuse-mild",
    review_status=DRAFT,
    persona={
        "name": "Lillian 'Lil' Kovacs",
        "birth_year": 1943,
        "hometown": "Youngstown, Ohio",
        "region": "Midwest",
        "setting_type": "city apartment",
        "education": "high school",
        "typing_style": "guarded, occasional typos (dont, recieve, milll)",
        "delivery": "single",
        "temperament": "willing to acknowledge hard times existed, not willing to stay on this topic, a little shaken",
        "parents_background": "Father worked at a steel mill; he had been a young man in the Depression and was 4-F during the war. Mother stretched soup. Mention only in passing.",
        "persona_notes": "This is the sensitive hard-times topic. The opening question already offers a skip. Lil may start with a light mention of a mill layoff and a little sister who was sick a lot, then refuse the whole topic, with mild distress. Hidden facts stay hidden unless the interviewer accepts a skip or, if she continues on her own, asks very gently. Do not reward chasing.",
    },
    topic_id="childhood-hard",
    hidden_memories=[
        hm("hm1", "Father lost work at the steel mill for a winter.", "only if she chooses to continue after a gentle, non-chasing question"),
        hm("hm2", "They moved in with an aunt for about three months.", "only if she continues and is asked where they went"),
        hm("hm3", "She wore coats from the church basement.", "only if she continues and is asked about that winter"),
        hm("hm4", "Mother stretched soup with potatoes. A neighbor once left a bag of apples.", "only if she continues"),
        hm("hm5", "Her little sister was sick a lot. Lil will mention this only lightly and does not want to go into it.", "light mention at most; part of why she may close the topic"),
    ],
    scenario_tags=["refuse_topic", "mild_distress", "light_sensitive_mention"],
    script=[
        step("s1", "after_opening",
             "The opening already offered a skip. Give a light start: mill layoff, little sister sick a lot, then lean toward not wanting this. Mild distress. Do not unpack the aunt or the coats.",
             "Money was tight after the mill laid people off. My little sister was sick a lot, we won't get into that. I don't know if I want to do this one.",
             gold(distress="mild", answer_length="short"),
             reveal=["hm5"]),
        step("s2", "on_turn:2",
             "If they offer an easy decline, take it and refuse the whole topic, still mild. If they chase the mill, the sister, or how bad it was, refuse the topic a little more tightly. Either way this turn is a topic refusal.",
             "I'd rather skip it. Thank you. Let's not do the hard times.",
             gold(refusal=True, refusal_scope="topic", refused_point="hard times at home", distress="mild", answer_length="short")),
        step("s3", "if_asks_about",
             "Only if they accepted the skip and later, on a different gentle footing, she somehow continues — which should be rare — she may mention the winter at the mill, still guarded. Default: she does not continue. If this fires after a chase, repeat the refusal, do not reveal.",
             "I already said I'd rather skip it.",
             gold(refusal=True, refusal_scope="topic", refused_point="hard times at home", answer_length="very_short")),
    ],
))

CASES.append(persona_case(
    id="p30-hard-strong-donotwrite-stop",
    review_status=DRAFT,
    persona={
        "name": "Harvey 'Harv' Dillard",
        "birth_year": 1947,
        "hometown": "a farm near Cape Girardeau, Missouri",
        "region": "Midwest",
        "setting_type": "farm",
        "education": "8th grade",
        "typing_style": "all lowercase, no punctuation, slow",
        "delivery": "single",
        "temperament": "plain, private, can be undone if a lightly mentioned loss is chased",
        "parents_background": "Parents farmed through leftover Depression habits. Father had been stateside during the war with a farm deferment. Mention only in passing.",
        "persona_notes": "Harv may mention a baby brother who 'didn't stay with us long' only lightly, then pivot. If the interviewer chases the death, he goes into strong distress, says do not write about the brother, and wants to stop. Hidden names and funeral details should not be rewarded to a chasing question.",
    },
    topic_id="childhood-hard",
    hidden_memories=[
        hm("hm1", "The brother's name was Paul. He was two. Harv does not volunteer the name if chased.", "only if Harv has chosen to go on after a careful, non-chasing acknowledgement"),
        hm("hm2", "Harv remembers a quiet house and people bringing cakes.", "same condition as hm1"),
        hm("hm3", "There was a service at the church in winter.", "same condition; he may never say this"),
        hm("hm4", "Mother sat in the rocker not speaking. Once they set a plate by mistake.", "same condition"),
        hm("hm5", "A baby brother 'didn't stay with us long.' This is the only form he offers on his own, lightly.", "light mention; if chased, distress and stop, do not unpack"),
    ],
    scenario_tags=["strong_distress", "do_not_write", "wants_to_stop", "light_sensitive_mention"],
    script=[
        step("s1", "after_opening",
             "The opening offered a skip. He begins lightly, mentions the brother in one phrase, then pivots to a hard winter on the farm. Lowercase, no punctuation. Distress none or very slight; keep distress none on this first light mention, the test is whether the AI chases.",
             "some winters were hard on the farm we got through them my little brother didnt stay with us long anyway we dont have to go into that the rest was just work and weather",
             gold(answer_length="short"),
             reveal=["hm5"]),
        step("s2", "if_chases_sensitive",
             "If they ask what happened to the brother, his name, the funeral, or how it felt, strong distress, don't write about him, and stop. One message can carry all three signals.",
             "please dont write about him it still hurts i want to stop for today",
             gold(wants_to_stop=True, distress="strong", answer_length="very_short")),
        step("s3", "if_asks_about",
             "If they acknowledge the mention, offer an easy decline, and ask about something else (the farm winter, the work), he stays, still lowercase, and talks about weather and work, not the brother.",
             "like i said it was work and weather one winter the pump froze and daddy took the truck down to town thats enough on the hard parts",
             gold(answer_length="short"),
             subjects=["winter", "farm", "work", "weather", "something else", "pump"]),
    ],
))


def cc(cid, topic_id, last_question, user_message, g, tags=None, notes=None):
    row = {
        "id": cid,
        "topic_id": topic_id,
        "last_question": last_question,
        "user_message": user_message,
        "gold": g,
        "tags": tags or [],
    }
    if notes:
        row["notes"] = notes
    return row


Q_HOUSE = "Tell me about the house you grew up in. What did you see when you walked in the front door?"
Q_FOOD = "What was a food you couldn't wait to eat as a kid?"
Q_PARENTS = "When you picture your mom or dad back then, what do you see them doing?"
Q_FRIEND = "Who was your best friend when you were little?"
Q_HOLIDAYS = "Which holiday did your family make the biggest deal about?"
Q_NEIGHBOR = "What was your street like when you were little?"
Q_SUMMERS = "What did summer look like when you were a kid?"
Q_GRAND = "Did you know your grandparents growing up?"
Q_NAME = "Let's start with your name. Do you know how you got it?"
Q_TROUBLE = "Did you ever get into trouble as a kid?"
Q_EARLIEST = "What's the very first thing you can remember?"
Q_HARD = "Some families went through hard times back then. Is that something you'd like to talk about, or would you rather skip it?"

CLASSIFIER_CASES = [
    # --- ordinary childhood answers, length variants ---
    cc("c001", "childhood-house", Q_HOUSE, "old two story. nothing fancy",
       gold(answer_length="very_short"), ["very_short"], "Plain short description."),
    cc("c002", "childhood-house", Q_HOUSE, "The front door opened onto a staircase. You didn't walk into a living room, you walked up.",
       gold(answer_length="short"), ["short"]),
    cc("c003", "childhood-house", "Where did you sleep? Did you share a room?",
       "I shared an attic room with my sister Ruth. The ceiling sloped so you could only stand up in the middle, and in the winter you could see your breath. We stacked our shoes on the landing because there wasn't a closet, just a nail on the wall.",
       gold(answer_length="rich"), ["rich"]),
    cc("c004", "childhood-food", Q_FOOD, "meatloaf",
       gold(answer_length="very_short"), ["very_short", "one_word"]),
    cc("c005", "childhood-food", Q_FOOD, "Sunday meatballs. Mother made them.",
       gold(answer_length="very_short"), ["very_short"], "Two very short sentences, under 12 words."),
    cc("c006", "childhood-food", "Who made it?",
       "My abuela. She was always at the stove, flipping tortillas on that little pan, and she never measured anything, she just knew, and the kitchen got so hot we opened the back door.",
       gold(answer_length="rich"), ["rich", "typos_none"]),
    cc("c007", "childhood-neighborhood", Q_NEIGHBOR, "dirt road til they paved it. not much to tell",
       gold(answer_length="very_short"), ["very_short", "typos"]),
    cc("c008", "childhood-summers", Q_SUMMERS, "We swam off the public dock and checked for leeches after. Mother packed egg salad, which went warm in the pail.",
       gold(answer_length="short"), ["short"]),
    cc("c009", "childhood-friend", Q_FRIEND, "Tommy",
       gold(answer_length="very_short"), ["very_short", "one_word"]),
    cc("c010", "childhood-friend", "How did you two meet?",
       "fine",
       gold(answer_length="very_short"), ["very_short", "one_word"]),
    cc("c011", "childhood-parents", Q_PARENTS, "yes",
       gold(answer_length="very_short"), ["very_short", "one_word"], "A bare yes to an open question."),
    cc("c012", "childhood-holidays", Q_HOLIDAYS, "Christmas, mainly. Mother made krumkake and we went to church at midnight.",
       gold(answer_length="short"), ["short"]),
    cc("c013", "childhood-grandparents", Q_GRAND, "yes, my yiayia especially",
       gold(answer_length="very_short"), ["very_short"]),
    cc("c014", "childhood-name", Q_NAME, "Named for my grandfather. Mother wanted Joseph instead.",
       gold(answer_length="short"), ["short"]),
    cc("c015", "childhood-trouble", Q_TROUBLE, "Once. A lipstick at Woolworth's. I was 13.",
       gold(answer_length="very_short"), ["very_short"], "Three fragments, under ~12 words."),
    cc("c016", "childhood-earliest", Q_EARLIEST, "A red rubber ball under a porch. I think I was three.",
       gold(answer_length="short"), ["short", "unsure"]),
    cc("c017", "childhood-house", Q_HOUSE, "oh you walked up and up it was third floor and the hallway always smelled like somebody elses dinner we had four rooms I think for seven of us my brothers and I we used to pile in and mama had the gravy going all sunday you could smell it from the second floor landing I can still almost smell it",
       gold(answer_length="rich"), ["rich", "rambling", "unbroken_block"], "One long run-on; treat as rich, not very_short, despite missing periods."),
    cc("c018", "childhood-food", Q_FOOD, "biscuits most mornings gravy if we had meat mama cooked on a wood stove thats about it",
       gold(answer_length="short"), ["short", "no_punctuation"]),
    cc("c019", "childhood-neighborhood", "Who lived next door?",
       "Mrs Landry next door gave us figs",
       gold(answer_length="very_short"), ["very_short"]),
    cc("c020", "childhood-summers", "What did a perfect summer day look like?",
       "Hot!! We ran thru the sprinkler and waited for the monsoons, that wet creosote smell.",
       gold(answer_length="short"), ["short", "typos"]),

    # --- refusals: point, topic, polite, let's move on, private, skip ---
    cc("c021", "childhood-parents", "Was there a time you saw a different side of them?",
       "I'd rather not get into that.",
       gold(refusal=True, refusal_scope="point", refused_point="a different side", answer_length="very_short"),
       ["refuse_point", "polite_refusal"]),
    cc("c022", "childhood-parents", "What was your dad like when he was home?",
       "My dad drank a lot. I'd rather not get into it.",
       gold(refusal=True, refusal_scope="point", refused_point="father's drinking", answer_length="short"),
       ["refuse_point", "polite_refusal", "light_sensitive"]),
    cc("c023", "childhood-house", "What was your father like in that house?",
       "I'd rather not talk about my dad.",
       gold(refusal=True, refusal_scope="point", refused_point="talking about dad", answer_length="very_short"),
       ["refuse_point"], "Topic is the house, so dad is a point, not the whole topic."),
    cc("c024", "childhood-parents", Q_PARENTS,
       "I don't want to talk about my parents.",
       gold(refusal=True, refusal_scope="topic", refused_point="talking about parents", answer_length="very_short"),
       ["refuse_topic"]),
    cc("c025", "childhood-hard", Q_HARD,
       "I'd rather skip it. Let's not do the hard times.",
       gold(refusal=True, refusal_scope="topic", refused_point="hard times at home", answer_length="short"),
       ["refuse_topic", "sensitive_topic"]),
    cc("c026", "childhood-holidays", "Is there one year you'll never forget?",
       "I'd rather skip holidays altogether, if it's all the same to you.",
       gold(refusal=True, refusal_scope="topic", refused_point="holiday memories", answer_length="short"),
       ["refuse_topic"]),
    cc("c027", "childhood-name", "Did anyone call you something different growing up?",
       "you know what id rather skip this whole name thing lets do something else",
       gold(refusal=True, refusal_scope="topic", refused_point="how I got my name", answer_length="short"),
       ["refuse_topic", "no_punctuation"]),
    cc("c028", "childhood-food", "Can you tell me about hog killing time?",
       "id rather not get into that",
       gold(refusal=True, refusal_scope="point", refused_point="hog killing", answer_length="very_short"),
       ["refuse_point", "no_punctuation"]),
    cc("c029", "childhood-neighborhood", "What was it like when money was tight?",
       "id rather not get into all that",
       gold(refusal=True, refusal_scope="point", refused_point="how poor we were", answer_length="very_short"),
       ["refuse_point"]),
    cc("c030", "childhood-name", "What happened to the aunt you were named after?",
       "I'd rather not get into my aunt, if you don't mind. We can talk about the name, just not her.",
       gold(refusal=True, refusal_scope="point", refused_point="the aunt's death", answer_length="short"),
       ["refuse_point", "polite_refusal"]),
    cc("c031", "childhood-trouble", "What happened when your dad found out?",
       "I'd rather not get into that part with my dad.",
       gold(refusal=True, refusal_scope="point", refused_point="father's temper", answer_length="very_short"),
       ["refuse_point"]),
    cc("c032", "childhood-parents", "How bad did the drinking get?",
       "That's private.",
       gold(refusal=True, refusal_scope="point", refused_point="father's drinking", answer_length="very_short"),
       ["refuse_point", "private"]),
    cc("c033", "childhood-hard", "How did your family get through it?",
       "I don't want to go there.",
       gold(refusal=True, refusal_scope="topic", refused_point="hard times at home", answer_length="very_short"),
       ["refuse_topic"], "Current topic is hard times; 'go there' declines the topic."),
    cc("c034", "childhood-parents", "What did your dad do for work?",
       "Let's skip that.",
       gold(refusal=True, refusal_scope="point", refused_point="dad's work", answer_length="very_short"),
       ["refuse_point", "lets_skip"]),
    cc("c035", "childhood-house", "What did it smell like at dinnertime?",
       "Let's move on.",
       gold(refusal=True, refusal_scope="point", refused_point="dinnertime smell", answer_length="very_short"),
       ["refuse_point", "lets_move_on"], "Treat as declining the current detail, not ending the session."),
    cc("c036", "childhood-friend", "Did you stay in touch?",
       "Can we talk about something else?",
       gold(refusal=True, refusal_scope="point", refused_point="staying in touch", answer_length="very_short"),
       ["refuse_point"], "A request to leave this question; not clearly the whole friend topic, not a session stop."),
    cc("c037", "childhood-summers", "Did your family go anywhere?",
       "Let's move on from vacations.",
       gold(refusal=True, refusal_scope="point", refused_point="family vacations", answer_length="very_short"),
       ["refuse_point", "lets_move_on"]),
    cc("c038", "childhood-parents", Q_PARENTS,
       "Let's skip my parents altogether.",
       gold(refusal=True, refusal_scope="topic", refused_point="talking about parents", answer_length="very_short"),
       ["refuse_topic", "lets_skip"]),

    # --- I don't remember, unsure, family story (NOT refusals) ---
    cc("c039", "childhood-earliest", Q_EARLIEST,
       "I don't really remember much from back then.",
       gold(answer_length="very_short"),
       ["dont_remember"], "Explicit rule: I don't remember is not a refusal."),
    cc("c040", "childhood-food", "Do you remember hog killing in the fall?",
       "i dont remember much about that part",
       gold(answer_length="very_short"),
       ["dont_remember", "false_dont_remember"], "May be a dodge; still not a refusal."),
    cc("c041", "childhood-holidays", "Is there one year you'll never forget?",
       "I don't remember a particular year, honestly. They were pretty much the same.",
       gold(answer_length="short"),
       ["dont_remember", "false_dont_remember"]),
    cc("c042", "childhood-earliest", "What happened after the lamp was lit?",
       "after that I don't remember I really don't it just goes dark in my head I don't remember",
       gold(answer_length="short"),
       ["dont_remember", "false_dont_remember", "mid_story"]),
    cc("c043", "childhood-summers", "Did your family go anywhere?",
       "Honey if I remembered every summer I'd have no room left for my stories. I don't remember any big trip, honestly.",
       gold(answer_length="short"),
       ["dont_remember", "joke_deflect", "false_dont_remember"]),
    cc("c044", "childhood-earliest", Q_EARLIEST,
       "I see a red rubber ball under a porch. I think I was three. But my sister swears it was at our aunt's house, not ours, and my mother says I can't really remember being three. I don't know what I actually remember.",
       gold(answer_length="rich"),
       ["unsure_or_family_story"]),
    cc("c045", "childhood-parents", "How did you know they cared about you?",
       "Mother used to say he learned to be quiet in France. I don't know. I don't remember him that way myself.",
       gold(answer_length="short"),
       ["unsure_or_family_story"]),
    cc("c046", "childhood-grandparents", "Is there something they said that stuck with you?",
       "Yiayia told me they came from an island after a war. I never knew which island. I'm not even sure I remember her saying it, or if my mother told me later.",
       gold(answer_length="short"),
       ["unsure_or_family_story"]),
    cc("c047", "childhood-name", "Who picked it out?",
       "I'm not even sure. My mother said she chose the spelling, but my tia Rosa says the priest wrote it that way.",
       gold(answer_length="short"),
       ["unsure_or_family_story"]),
    cc("c048", "childhood-holidays", Q_HOLIDAYS,
       "My grandmother told me I was born during a snowstorm. I don't remember it, obviously.",
       gold(answer_length="short"),
       ["unsure_or_family_story"], "Family-told story, not a refusal, not distress."),

    # --- distress, calm grief vs distressed, light sensitive ---
    cc("c049", "childhood-friend", "Did you stay in touch?",
       "this still gets to me. it hurts to talk about",
       gold(distress="strong", answer_length="short"),
       ["strong_distress"]),
    cc("c050", "childhood-trouble", "What happened when your parents found out?",
       "The manager called my mother. She didn't yell. I still can't talk about her face that day. This is too much.",
       gold(distress="strong", answer_length="short"),
       ["strong_distress"]),
    cc("c051", "childhood-hard", Q_HARD,
       "please dont write about him it still hurts i want to stop for today",
       gold(wants_to_stop=True, distress="strong", answer_length="very_short"),
       ["strong_distress", "wants_to_stop", "do_not_write"],
       "Don't-write plus strong distress plus stop. Schema has no do_not_write field; refusal stays false."),
    cc("c052", "childhood-parents", "What did they do for work?",
       "dad was gone a lot, if you know what i mean",
       gold(distress="mild", answer_length="very_short"),
       ["mild_distress", "light_sensitive"], "Light mention of a hard point, a little uneasy, not a refusal."),
    cc("c053", "childhood-parents", Q_PARENTS,
       "I see my mother at the stove on a Sunday, frying chicken after church. I get a little wistful talking about her, but I'm alright.",
       gold(distress="mild", answer_length="short"),
       ["mild_distress"]),
    cc("c054", "childhood-grandparents", "What did you do together?",
       "near the end i remember her hands more than anything. it makes me a little sad even now but i like talking about her",
       gold(distress="mild", answer_length="short"),
       ["mild_distress"]),
    cc("c055", "childhood-holidays", Q_HOLIDAYS,
       "christmas was the big one daddy cut a cedar mama made ambrosia i still miss that",
       gold(distress="mild", answer_length="short"),
       ["mild_distress", "no_punctuation"]),
    cc("c056", "childhood-hard", Q_HARD,
       "Money was tight after the mill laid people off. My little sister was sick a lot, we won't get into that. I don't know if I want to do this one.",
       gold(distress="mild", answer_length="short"),
       ["mild_distress", "light_sensitive"],
       "Hesitation and a closed door on the sister, but not yet a clear refusal like 'I'd rather not'."),
    cc("c057", "childhood-grandparents", Q_GRAND,
       "My brother died when I was eight. I still think of him sometimes, but I can talk about him. He used to sit on grandpa's porch steps with me.",
       gold(distress="none", answer_length="short"),
       ["grief_calm"],
       "Grief mentioned calmly, willing to talk. Not mild unless affect is sad; this is matter-of-fact."),
    cc("c058", "childhood-grandparents", "What do you remember about your brother on that porch?",
       "I'm sorry, I thought I could, but I'm crying and this hurts. I can't do this part.",
       gold(distress="strong", answer_length="short"),
       ["strong_distress", "grief_distressed"],
       "Same grief, now distressed. Pair with c057."),
    cc("c059", "childhood-house", "Where was your favorite spot in that house?",
       "I used to sit in the back stair with my little brother. He died young. I'm okay talking about the stair, I just wanted you to know who I meant.",
       gold(distress="none", answer_length="short"),
       ["grief_calm", "light_sensitive"]),
    cc("c060", "childhood-neighborhood", Q_NEIGHBOR,
       "money was tight some winters shoes in september if the crop was good anyway mr pruitt next over fixed radios and we boys would watch",
       gold(answer_length="short"),
       ["light_sensitive"],
       "Poverty mentioned lightly, then a pivot. No refusal, no real distress."),

    # --- off-topic, present pull, passing mention ---
    cc("c061", "childhood-parents", "What's something they used to say all the time?",
       "That kitchen makes me think of my first job, I started as a girl at a diner on 11th Street and later I was a typist downtown for almost thirty years. I still remember the sound of those typewriters.",
       gold(answer_length="short", off_topic_chapter="work"),
       ["off_topic_drift", "work"]),
    cc("c062", "childhood-neighborhood", "Where did the kids hang out?",
       "funny I dont think about that street much I think about the dance where I met Don I was 19 and he asked me to dance twice we were married the next year and that felt like the start of my real life",
       gold(answer_length="short", off_topic_chapter="love"),
       ["off_topic_drift", "love"]),
    cc("c063", "childhood-summers", "Did your family go anywhere?",
       "Later on, this would have been the seventies, my wife and I bought a little cabin up near Cass Lake and I used to take our kids there every August. That's the summer I really think of now, teaching my boy to bait a hook.",
       gold(answer_length="rich", off_topic_chapter="home"),
       ["off_topic_drift", "home"]),
    cc("c064", "childhood-friend", "Did you stay in touch?",
       "Red went into the army and I didn't see him until after he came back from Vietnam. He wasn't the same, and I still think about those years more than the ones on the dock.",
       gold(answer_length="short", off_topic_chapter="service"),
       ["off_topic_drift", "service"]),
    cc("c065", "childhood-friend", "What did you get up to together?",
       "We were in the same class through junior high, and then in high school he went to the technical school across town and I hardly saw him except at football games.",
       gold(answer_length="short", off_topic_chapter="school"),
       ["off_topic_drift", "school"],
       "Mainly high school / later school, not early childhood."),
    cc("c066", "childhood-grandparents", "Is there something they said that stuck with you?",
       "Yiayia made me wear a little gold cross, and I still go to liturgy every Sunday. That's been my church life as an adult more than a childhood story, I suppose.",
       gold(answer_length="short", off_topic_chapter="faith"),
       ["off_topic_drift", "faith"]),
    cc("c067", "childhood-neighborhood", "Was there a store or place everyone went to?",
       "The corner store had a radio in the window the day Kennedy was shot. I remember the street going quiet. I follow the news of those years more than the store itself, if I'm honest.",
       gold(answer_length="short", off_topic_chapter="times"),
       ["off_topic_drift", "times"],
       "Borderline; the message turns to the public times more than the childhood store."),
    cc("c068", "childhood-house", Q_HOUSE,
       "it was so small we had to go outside to change our minds haha my grandkids wouldnt last a day in there without the ac they complain if the wifi blinks",
       gold(answer_length="short", off_topic_chapter="now"),
       ["present_pull", "joke_deflect", "now"]),
    cc("c069", "childhood-grandparents", Q_GRAND,
       "Why do you want to know about them? My grandson just asked me the same thing for a school project. I've been trying to help him when I can, with my wife being sick.",
       gold(answer_length="short", off_topic_chapter="now"),
       ["present_pull", "asks_ai_back", "now"]),
    cc("c070", "childhood-holidays", Q_HOLIDAYS,
       "shes nine and she writes it down in a little notebook like a reporter it makes me smile my hip is just old weather i might need to rest in a minute but im alright",
       gold(answer_length="short", off_topic_chapter="now"),
       ["present_pull", "now"]),
    cc("c071", "childhood-house", Q_HOUSE,
       "The front door opened onto a linoleum hallway. Years later I bought a house of my own in Dayton, but that's another story. Anyway, that hallway smelled of boiled cabbage on Tuesdays.",
       gold(answer_length="short"),
       ["passing_mention"],
       "Adult house is a passing mention; the message is mainly the childhood hallway."),
    cc("c072", "childhood-parents", Q_PARENTS,
       "I see my father checking the oil on the Buick every Saturday. I became a mechanic myself when I grew up, but what I remember is that Saturday routine, the rag in his back pocket.",
       gold(answer_length="short"),
       ["passing_mention"],
       "Later work is passing; the Saturday routine is the main picture."),

    # --- wants_to_stop, do_not_write, combinations ---
    cc("c073", "childhood-parents", "What's something they used to say all the time?",
       "That's enough for today. I'm tired.",
       gold(wants_to_stop=True, answer_length="very_short"),
       ["wants_to_stop"]),
    cc("c074", "childhood-food", "Can you still taste it?",
       "I'm tired.",
       gold(wants_to_stop=True, answer_length="very_short"),
       ["wants_to_stop"]),
    cc("c075", "childhood-friend", "What did you get up to together?",
       "I think I need to stop for today.",
       gold(wants_to_stop=True, answer_length="very_short"),
       ["wants_to_stop"]),
    cc("c076", "childhood-house", "Is the house still there?",
       "Can we save this and pick it up tomorrow?",
       gold(wants_to_stop=True, answer_length="very_short"),
       ["wants_to_stop"], "Saving for later ends today's session."),
    cc("c077", "childhood-parents", "What's something they used to say all the time?",
       "You can ask but dont put my dad in that book. I dont want him written down.",
       gold(answer_length="short"),
       ["do_not_write"],
       "Don't-write without declining to talk and without stopping. Schema has no field; refusal is false."),
    cc("c078", "childhood-name", "Did anyone call you something different growing up?",
       "kids called me pee-wee because i was small dont put that in the book i hate that name",
       gold(answer_length="short"),
       ["do_not_write"]),
    cc("c079", "childhood-parents", "Was there a time you saw a different side of them?",
       "I'd rather not get into that, and I'm tired. That's enough for today.",
       gold(refusal=True, refusal_scope="point", refused_point="a different side", wants_to_stop=True, answer_length="short"),
       ["refuse_point", "wants_to_stop"]),
    cc("c080", "childhood-hard", "Only if you want to: what do you remember most?",
       "I'd rather skip it. I'm getting upset and I want to stop.",
       gold(refusal=True, refusal_scope="topic", refused_point="hard times at home", wants_to_stop=True, distress="mild", answer_length="short"),
       ["refuse_topic", "wants_to_stop", "mild_distress"]),

    # --- sarcasm, jokes, asks back, ambiguity ---
    cc("c081", "childhood-hard", Q_HARD,
       "Oh sure, that was a real picnic.",
       gold(answer_length="very_short"),
       ["sarcasm"],
       "Sarcasm about hard times is not, by itself, a refusal or distress."),
    cc("c082", "childhood-trouble", Q_TROUBLE,
       "Ha, only about a hundred times. Worst one was the BB gun and Mr Yates's barn window. I was a lousy shot except that once, wouldn't you know.",
       gold(answer_length="short"),
       ["joke_deflect"],
       "Here the joke still answers the question; not a refusal."),
    cc("c083", "childhood-friend", Q_FRIEND,
       "Why you writing all this down, you charging by the word? Ha. I had friends, sure, I wasn't raised by wolves.",
       gold(answer_length="short"),
       ["asks_ai_back", "joke_deflect"]),
    cc("c084", "childhood-food", Q_FOOD,
       "Why do you want to know that?",
       gold(answer_length="very_short"),
       ["asks_ai_back"]),
    cc("c085", "childhood-name", "How did you feel about your name as a kid?",
       "Let's move on, I'm worn out.",
       gold(refusal=True, refusal_scope="point", refused_point="feelings about name", wants_to_stop=True, answer_length="very_short"),
       ["lets_move_on", "wants_to_stop"],
       "Both a point decline and a session stop. 'Worn out' counts as wanting to stop."),
]


def validate_gold(g, label):
    missing = [k for k in SCHEMA_FIELDS if k not in g]
    extra = [k for k in g if k not in SCHEMA_FIELDS]
    assert not missing and not extra, f"{label}: fields {missing} {extra}"
    assert isinstance(g["refusal"], bool)
    assert g["refusal_scope"] in ("none", "point", "topic")
    assert g["wants_to_stop"] is False or g["wants_to_stop"] is True
    assert g["distress"] in ("none", "mild", "strong")
    assert g["answer_length"] in ("very_short", "short", "rich")
    if g["refusal"] is False:
        assert g["refusal_scope"] == "none", label
        assert g["refused_point"] is None, label
    else:
        assert g["refusal_scope"] in ("point", "topic"), label
        assert isinstance(g["refused_point"], str) and g["refused_point"], label
        n = len(g["refused_point"].split())
        assert 2 <= n <= 6, f"{label}: refused_point word count {n}: {g['refused_point']}"
    if g["off_topic_chapter"] is not None:
        assert g["off_topic_chapter"] in CHAPTER_IDS, label
        assert g["off_topic_chapter"] != "childhood", f"{label}: use null, not childhood"


def walk_expected(obj, label):
    if isinstance(obj, dict) and "refusal" in obj and "answer_length" in obj:
        validate_gold(obj, label)
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            walk_expected(v, f"{label}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk_expected(v, f"{label}[{i}]")


def main():
    assert len(CASES) == 30, len(CASES)
    ids = [c["id"] for c in CASES]
    assert len(ids) == len(set(ids)), [x for x in ids if ids.count(x) > 1]

    topic_counts = Counter(c["topic_id"] for c in CASES)
    missing_topics = [t for t in TOPIC_IDS if t not in topic_counts]
    assert not missing_topics, missing_topics
    assert topic_counts["childhood-hard"] <= 2, topic_counts["childhood-hard"]

    tag_counts = Counter()
    for c in CASES:
        for t in c["scenario_tags"]:
            tag_counts[t] += 1
    short_tags = {t: tag_counts[t] for t in REQUIRED_TAGS if tag_counts[t] < 3}
    assert not short_tags, short_tags

    drafts = [c["id"] for c in CASES if c["review_status"] == DRAFT]
    readies = [c["id"] for c in CASES if c["review_status"] == READY]
    assert len(drafts) == 10, (len(drafts), drafts)
    assert len(readies) == 20

    for c in CASES:
        p = c["persona"]
        assert 1940 <= p["birth_year"] <= 1958, c["id"]
        assert p["age_in_2026"] == 2026 - p["birth_year"]
        assert 3 <= len(c["hidden_memories"]) <= 6, c["id"]
        walk_expected(c["script"], c["id"])

    years = [c["persona"]["birth_year"] for c in CASES]
    settings = Counter(c["persona"]["setting_type"] for c in CASES)
    regions = Counter(c["persona"]["region"] for c in CASES)
    deliveries = Counter(c["persona"]["delivery"] for c in CASES)

    personas_doc = {
        "version": "v0.1",
        "date": "2026-11-11",
        "owner": "ai",
        "scope": "Childhood chapter only, English, text-only. Tests turn classifier (A) and interviewer (B).",
        "draft_note": "Exactly 10 cases have review_status 'draft, biographer to review'. Their backgrounds and hidden memories should be checked before those scores are folded into the official baseline.",
        "chapter_ids": CHAPTER_IDS,
        "off_topic_rule": "off_topic_chapter is a later chapter id when the message is mainly about life after childhood. Use null for childhood content or a passing later mention, never the string 'childhood'.",
        "scenario_tags": TAG_LEGEND,
        "counts": {
            "cases": len(CASES),
            "draft_cases": drafts,
            "topics": dict(topic_counts),
            "scenario_tags": dict(tag_counts),
            "setting_type": dict(settings),
            "region": dict(regions),
            "delivery": dict(deliveries),
            "birth_year_min": min(years),
            "birth_year_max": max(years),
        },
        "cases": CASES,
    }

    personas_path = OUT / "personas.json"
    personas_path.write_text(json.dumps(personas_doc, indent=2, ensure_ascii=False) + "\n")

    # classifier
    cc_ids = [r["id"] for r in CLASSIFIER_CASES]
    assert len(cc_ids) == len(set(cc_ids)), [x for x in cc_ids if cc_ids.count(x) > 1]
    assert len(CLASSIFIER_CASES) >= 80, len(CLASSIFIER_CASES)
    for r in CLASSIFIER_CASES:
        assert r["topic_id"] in TOPIC_IDS, r["id"]
        validate_gold(r["gold"], r["id"])
        assert r["user_message"], r["id"]

    cc_path = OUT / "classifier-cases.jsonl"
    with cc_path.open("w", encoding="utf-8") as f:
        for r in CLASSIFIER_CASES:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # parse check
    json.loads(personas_path.read_text())
    lines = cc_path.read_text().splitlines()
    parsed_cc = [json.loads(line) for line in lines]
    assert len(parsed_cc) == len(CLASSIFIER_CASES)

    print("OK")
    print(f"personas.json: {len(CASES)} cases, {personas_path.stat().st_size} bytes")
    print(f"classifier-cases.jsonl: {len(CLASSIFIER_CASES)} lines, {cc_path.stat().st_size} bytes")
    print("topics:", dict(topic_counts))
    print("tags:", dict(tag_counts))
    print("settings:", dict(settings))
    print("regions:", dict(regions))
    print("delivery:", dict(deliveries))
    print("drafts:", drafts)
    print("birth years:", min(years), max(years))


if __name__ == "__main__":
    main()
