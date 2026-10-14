import asyncio
import re
from playwright.async_api import async_playwright

async def test_photos():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        # Acessa diretamente a página do lugar da Pousada Porto do Rio
        url = "https://www.google.com/maps/place/Pousada+Porto+do+Rio/@-23.6801361,-45.4418304,17z"
        print("Acessando:", url)
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        
        content = await page.content()
        # Procura por URLs reais de fotos com /p/AF1Qip
        photo_urls = re.findall(r'https://lh[0-9]\.googleusercontent\.com/p/[a-zA-Z0-9_\-]+', content)
        unique_photos = list(dict.fromkeys(photo_urls))
        
        print(f"Total de fotos reais /p/ encontradas no HTML: {len(unique_photos)}")
        for i, u in enumerate(unique_photos[:10]):
            print(f"Foto Real [{i+1}]: {u}=w800-h600-k-no")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_photos())
