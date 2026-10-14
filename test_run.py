import database
import scraper

def run():
    database.init_db()
    sc = scraper.LeadScraper(delay=0.1, timeout=5)
    print("Iniciando teste de varredura...")
    events = list(sc.run_scan_stream("Academias", "São Paulo - SP", max_leads=8))
    print(f"Total de eventos gerados: {len(events)}")
    last = events[-1]
    print(f"Resultado final: {last.get('message')}")
    if "leads" in last:
        scan_id = database.save_scan("Academias", "São Paulo - SP", len(last["leads"]), last["no_website_count"])
        database.save_leads(scan_id, last["leads"])
        print(f"Varredura salva com ID {scan_id} contendo {len(last['leads'])} leads!")
    stats = database.get_dashboard_stats()
    print("Estatísticas atuais do Dashboard:", stats)

if __name__ == "__main__":
    run()
