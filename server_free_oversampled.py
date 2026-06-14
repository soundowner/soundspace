import os
import json
import logging
import re
import math
import datetime
import httpx
import requests
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from fastmcp import FastMCP

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("superior-researcher-free")

# Initialize FastMCP Server
mcp = FastMCP("superior-researcher-free")

STOP_WORDS = {
    "a", "an", "the", "in", "on", "for", "with", "and", "or", "of", "to", "at", 
    "by", "from", "is", "are", "was", "were", "be", "been", "that", "this", 
    "these", "those", "it", "its", "we", "they", "you", "our", "their", "using",
    "on", "about", "through", "during", "before", "after", "under", "over"
}

# Expanded list of target AI Research Centers / Institutions
AI_CENTERS = {
    "google deepmind", "deepmind", "openai", "microsoft research", "microsoft",
    "mit", "stanford", "berkeley", "meta ai", "facebook ai", "fair", "meta",
    "anthropic", "google research", "google", "nvidia", "hugging face", "cmu",
    "carnegie mellon", "tsinghua", "allen institute", "ai2", "mistral",
    "oxford", "cambridge", "eth zurich", "epfl", "mila", "toronto", "nyu",
    "harvard", "princeton", "caltech", "washington", "uiuc"
}

# Expanded list of target Academic Venues (Conferences & Journals)
TARGET_VENUES = {
    "neurips", "icml", "cvpr", "arxiv", "iclr", "acl", "emnlp", "naacl",
    "sigir", "kdd", "aaai", "ijcai", "iccv", "eccv", "aistats", "uai",
    "tacl", "coling", "pmlr", "nature", "science", "ieee"
}

# Expanded list of target Top Researchers / Authors
TARGET_AUTHORS = {
    "ilya sutskever", "andrej karpathy", "yann lecun", "yoshua bengio",
    "geoffrey hinton", "andrew ng", "christopher manning", "noam shazeer",
    "quoc le", "harrison chase", "demis hassabis", "albert gu", "tri dao",
    "ashish vaswani", "sergey levine", "kaiming he", "danqi chen", "jason wei",
    "arthur mensch", "guillaume lample", "pieter abbeel", "chelsea finn"
}

def clean_tags(text: str) -> str:
    """Helper to remove XML/HTML tags and normalize spacing."""
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    return " ".join(text.split())

def tokenize(text: str) -> set:
    """Tokenize text by replacing punctuation/hyphens with space and converting to lowercase."""
    cleaned = re.sub(r'[^\w\s]', ' ', text.lower())
    tokens = cleaned.split()
    return {t for t in tokens if t not in STOP_WORDS and len(t) > 1}

def query_arxiv(search_query: str, limit: int) -> list:
    """Query the arXiv API and parse the Atom XML response."""
    url = "https://export.arxiv.org/api/query"
    params = {
        "search_query": search_query,
        "start": 0,
        "max_results": limit
    }

    logger.info(f"Querying arXiv API: search_query={search_query}, limit={limit}")
    resp = httpx.get(url, params=params, follow_redirects=True, timeout=30.0)
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    namespaces = {
        'atom': 'http://www.w3.org/2005/Atom',
        'arxiv': 'http://arxiv.org/schemas/atom'
    }

    entries = []
    for entry in root.findall('atom:entry', namespaces):
        # Extract ID (remove prefix URL)
        raw_id = entry.find('atom:id', namespaces)
        arxiv_id = ""
        if raw_id is not None and raw_id.text:
            arxiv_id = raw_id.text.split('/abs/')[-1]
            arxiv_id = re.sub(r'v\d+$', '', arxiv_id)

        # Extract Title
        raw_title = entry.find('atom:title', namespaces)
        title = raw_title.text if raw_title is not None else ""

        # Extract Summary
        raw_summary = entry.find('atom:summary', namespaces)
        summary = raw_summary.text if raw_summary is not None else ""

        # Extract Published Date
        raw_published = entry.find('atom:published', namespaces)
        published = raw_published.text if raw_published is not None else ""

        # Extract Authors & Affiliations
        authors = []
        affiliations = []
        for author in entry.findall('atom:author', namespaces):
            name_el = author.find('atom:name', namespaces)
            if name_el is not None and name_el.text:
                authors.append(name_el.text.strip())
            aff_el = author.find('arxiv:affiliation', namespaces)
            if aff_el is not None and aff_el.text:
                affiliations.append(aff_el.text.strip())

        # Extract PDF Link
        pdf_url = ""
        for link in entry.findall('atom:link', namespaces):
            is_pdf_title = link.attrib.get('title') == 'pdf'
            is_pdf_type = link.attrib.get('type') == 'application/pdf'
            if is_pdf_title or is_pdf_type:
                pdf_url = link.attrib.get('href', '')
                break
        if not pdf_url and arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

        entries.append({
            "id": arxiv_id,
            "title": title,
            "authors": authors,
            "affiliations": affiliations,
            "clean_summary": summary,
            "published": published,
            "pdf_url": pdf_url
        })

    return entries

def query_openalex(arxiv_id: str) -> dict:
    """Query OpenAlex API by arXiv ID landing page variations."""
    url_variations = [
        f"https://arxiv.org/abs/{arxiv_id}",
        f"http://arxiv.org/abs/{arxiv_id}",
        f"https://arxiv.org/pdf/{arxiv_id}",
        f"http://arxiv.org/pdf/{arxiv_id}",
        f"https://doi.org/10.48550/arXiv.{arxiv_id}",
        f"https://doi.org/10.48550/arxiv.{arxiv_id}"
    ]
    filter_val = "|".join(url_variations)
    url = "https://api.openalex.org/works"
    params = {
        "filter": f"locations.landing_page_url:{filter_val}",
        "mailto": "antigravity-researcher@example.com"
    }
    headers = {
        "User-Agent": "Antigravity-Superior-Researcher/1.0 (mailto:antigravity-researcher@example.com)"
    }
    
    try:
        logger.info(f"Querying OpenAlex for arXiv:{arxiv_id}")
        resp = requests.get(url, params=params, headers=headers, timeout=10.0)
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            if results:
                work = results[0]
                citations = work.get("cited_by_count", 0)
                primary_loc = work.get("primary_location") or {}
                source = primary_loc.get("source") or {}
                venue = source.get("display_name") or ""
                publisher = source.get("publisher") or ""
                logger.info(f"OpenAlex hit for arXiv:{arxiv_id}: citations={citations}, venue={venue}")
                return {
                    "citations": citations,
                    "venue": venue,
                    "publisher": publisher,
                    "success": True
                }
        logger.warning(f"OpenAlex no match or error {resp.status_code} for arXiv:{arxiv_id}")
    except Exception as e:
        logger.warning(f"OpenAlex request failed for arXiv:{arxiv_id}: {e}")
        
    return {"citations": 0, "venue": "", "publisher": "", "success": False}

def enrich_and_score(entry: dict, query_tokens: set) -> dict:
    """Enrich entry with citations & venue data, then calculate final score weight."""
    combined_text = (entry["title"] + " " + entry["clean_summary"]).lower()
    
    # 1. Dynamic Keyword Match Score
    entry_tokens = tokenize(combined_text)
    
    matching_count = 0
    for q in query_tokens:
        match = False
        for e in entry_tokens:
            if q == e or (len(q) >= 3 and e.startswith(q)):
                match = True
                break
        if match:
            matching_count += 1
            
    # Discard if no keywords match at all
    if matching_count == 0:
        logger.info(f"Paper skipped (no keyword match): '{entry['title']}'")
        return None
        
    match_score = matching_count * 20.0

    # Code validation (look for github.com / gitlab.com)
    has_code = False
    if "github.com" in combined_text or "gitlab.com" in combined_text:
        has_code = True

    # 2. Enrich Citations and Venue details via OpenAlex (Scholar fallback removed for stability)
    citations = 0
    venue = ""
    publisher = ""
    
    alex_data = query_openalex(entry["id"])
    if alex_data["success"]:
        citations = alex_data["citations"]
        venue = alex_data["venue"]
        publisher = alex_data["publisher"]
        
    venue_lower = venue.lower()
    publisher_lower = publisher.lower()

    # 3. Dynamic Institutional & Venue Authority Check
    is_top_affiliation = any(center in combined_text for center in AI_CENTERS)
    is_top_venue = any(v in f"{venue_lower} {publisher_lower}" for v in TARGET_VENUES)

    bonus_affiliation = 15.0 if is_top_affiliation else 0.0
    bonus_venue = 10.0 if is_top_venue else 0.0

    # 4. Top Researchers / Authors Check
    has_top_author = False
    for author in entry["authors"]:
        author_lower = author.lower()
        if any(ta in author_lower for ta in TARGET_AUTHORS):
            has_top_author = True
            break
    bonus_author = 15.0 if has_top_author else 0.0

    # 5. Calibrated Freshness Bonus
    pub_date_str = entry["published"][:10]
    try:
        pub_year = datetime.datetime.strptime(pub_date_str, "%Y-%m-%d").year
    except Exception:
        pub_year = 2025
        
    current_year = datetime.datetime.now().year
    bonus_freshness = max(0, 3 - (current_year - pub_year)) * 5.0

    # 6. Citations weight (stable log scaling)
    base_citations = math.log1p(citations) * 10.0

    # Calculate final weight
    total_sum = (
        match_score + bonus_freshness + base_citations +
        bonus_affiliation + bonus_venue + bonus_author
    )

    penalty = 1.0 if has_code else 0.9
    weight = total_sum * penalty

    return {
        "id": entry["id"],
        "title": clean_tags(entry["title"]),
        "authors": entry["authors"],
        "citations": citations,
        "has_code": has_code,
        "pdf_url": entry["pdf_url"],
        "clean_summary": clean_tags(entry["clean_summary"]),
        "weight": weight
    }

@mcp.tool(name="arxiv-researcher-free.get_validated_papers")
def get_validated_papers(query: str, limit: int) -> str:
    """Search and validate publications on arXiv and OpenAlex.

    Args:
        query: The arXiv search query (supports field prefixes like ti:,
               au:, abs: and operators AND, OR, ANDNOT).
        limit: Maximum number of results to fetch and score.
    """
    try:
        query_tokens = tokenize(query)
        syntax_words = {"ti", "abs", "au", "co", "key", "journal", "ref", "and", "or", "andnot"}
        query_tokens = {t for t in query_tokens if t not in syntax_words}
        logger.info(f"Query tokens for matching: {query_tokens}")
        
        # Step 1: Query arXiv with 15x oversampling (capped at 150)
        arxiv_limit = min(150, limit * 15)
        logger.info(f"Fetching {arxiv_limit} papers from arXiv for filtering (output limit is {limit})")
        
        arxiv_entries = query_arxiv(query, arxiv_limit)
        if not arxiv_entries:
            logger.info("No papers returned from arXiv.")
            return json.dumps([], separators=(',', ':'))

        # Step 2: Enrich, Validate and Score entries in parallel
        scored_entries = []
        
        def process_entry(entry):
            try:
                return enrich_and_score(entry, query_tokens)
            except Exception as e:
                logger.error(f"Error enriching paper '{entry.get('title')}': {e}", exc_info=True)
                return None

        # Execute parallel enrichment (max_workers=8 for fast query processing)
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(process_entry, entry) for entry in arxiv_entries]
            for fut in futures:
                res = fut.result()
                if res is not None:
                    scored_entries.append(res)

        # Step 3: Sort by calculated weight descending
        scored_entries.sort(key=lambda x: x["weight"], reverse=True)

        # Step 4: Return only the requested number of top papers
        top_entries = scored_entries[:limit]

        # Step 5: Format output to strictly compact JSON array without weight
        result = []
        for item in top_entries:
            result.append({
                "id": item["id"],
                "title": item["title"],
                "authors": item["authors"],
                "citations": item["citations"],
                "has_code": item["has_code"],
                "pdf_url": item["pdf_url"],
                "clean_summary": item["clean_summary"]
            })

        logger.info(f"Returning top {len(result)} validated papers.")
        return json.dumps(result, separators=(',', ':'))

    except Exception as e:
        logger.error(f"Error during validation and research process: {e}", exc_info=True)
        return json.dumps({"error": str(e)}, separators=(',', ':'))

if __name__ == "__main__":
    mcp.run()
