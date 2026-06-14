import sys
import json
import math
import datetime

sys.path.append('/home/mint/.gemini/antigravity-cli/plugins/superior-researcher-free')
import server

query = 'ti:"prompt engineering" OR abs:"prompt optimization"'
limit = 10

query_tokens = server.tokenize(query)
syntax_words = {"ti", "abs", "au", "co", "key", "journal", "ref", "and", "or", "andnot"}
query_tokens = {t for t in query_tokens if t not in syntax_words}
print(f"Query tokens: {query_tokens}")

# Step 1: Query arXiv
arxiv_limit = min(150, limit * 15)
arxiv_entries = server.query_arxiv(query, arxiv_limit)

# Step 2: Enrich and score
scored_entries = []
for entry in arxiv_entries:
    res = server.enrich_and_score(entry, query_tokens)
    if res is not None:
        # We also want to calculate the breakdown
        combined_text = (entry["title"] + " " + entry["clean_summary"]).lower()
        entry_tokens = server.tokenize(combined_text)
        matching_count = sum(1 for q in query_tokens if any(e == q or (len(q) >= 3 and e.startswith(q)) for e in entry_tokens))
        match_score = matching_count * 20.0
        
        has_code = res["has_code"]
        citations = res["citations"]
        
        is_top_affiliation = any(center in combined_text for center in server.AI_CENTERS)
        # We need to query openalex info (already done in res)
        # But we can reconstruct components
        pub_date_str = entry["published"][:10]
        pub_year = 2025
        try:
            pub_year = datetime.datetime.strptime(pub_date_str, "%Y-%m-%d").year
        except Exception:
            pass
        current_year = datetime.datetime.now().year
        bonus_freshness = max(0, 3 - (current_year - pub_year)) * 5.0
        
        base_citations = math.log1p(citations) * 10.0
        
        # Get affiliation/venue/author bonuses
        has_top_author = False
        for author in entry["authors"]:
            author_lower = author.lower()
            if any(ta in author_lower for ta in server.TARGET_AUTHORS):
                has_top_author = True
                break
        bonus_author = 15.0 if has_top_author else 0.0
        
        # Since we don't have venue in raw entry, let's query it
        # server.enrich_and_score already did the OpenAlex query, but we can look at the math
        # total_sum = match_score + bonus_freshness + base_citations + bonus_affiliation + bonus_venue + bonus_author
        # penalty = 1.0 if has_code else 0.9
        # weight = total_sum * penalty
        
        # We can extract the final weight from res
        weight = res["weight"]
        
        scored_entries.append({
            "title": res["title"],
            "citations": citations,
            "has_code": has_code,
            "weight": weight,
            "match_score": match_score,
            "bonus_freshness": bonus_freshness,
            "base_citations": base_citations,
            "bonus_author": bonus_author,
            "pub_year": pub_year
        })

# Sort
scored_entries.sort(key=lambda x: x["weight"], reverse=True)

print("\n=== TOP PAPERS WITH SCORING BREAKDOWN ===")
for i, item in enumerate(scored_entries[:limit]):
    print(f"\n{i+1}. '{item['title']}'")
    print(f"   Citations: {item['citations']} (Log score: {item['base_citations']:.2f} pts)")
    print(f"   Pub Year:  {item['pub_year']} (Freshness bonus: {item['bonus_freshness']:.2f} pts)")
    print(f"   Keywords match score: {item['match_score']:.2f} pts")
    print(f"   Author bonus: {item['bonus_author']:.2f} pts")
    print(f"   Has Code:  {item['has_code']} (Penalty multiplier: {1.0 if item['has_code'] else 0.9})")
    print(f"   FINAL WEIGHT: {item['weight']:.2f}")
