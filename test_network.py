import asyncio
from playwright.async_api import async_playwright

async def test_network():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        captured_images = []
        captured_json = []

        page.on("response", lambda response: handle_response(response, captured_images, captured_json))

        url = "https://www.google.com/maps/search/Pousada+Porto+do+Rio+Caraguatatuba?hl=pt-BR"
        print("Navegando para:", url)
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        
        # Clica no primeiro card
        first_card = await page.query_selector('a.hfpxzc')
        if first_card:
            print("Clicando no card...")
            await first_card.click()
            await page.wait_for_timeout(3500)
            
            # Clica no botão de foto do estabelecimento
            photo_btn = await page.query_selector('button[aria-label*="Foto" i], button[aria-label*="foto" i], button[jsaction*="heroHeaderImage"]')
            if photo_btn:
                print("Clicando no botao de foto da pousada...")
                await photo_btn.click()
                await page.wait_for_timeout(4000)

        print(f"Total de respostas de imagem capturadas: {len(captured_images)}")
        for i, img in enumerate(captured_images[:15]):
            print(f"Img [{i}]: {img[:100]}")

        await browser.close()

def handle_response(response, img_list, json_list):
    url = response.url
    if "googleusercontent.com" in url or "ggpht.com" in url:
        if "=s32" not in url and "=s36" not in url and "avatar" not in url:
            if url not in img_list:
                img_list.append(url)

if __name__ == "__main__":
    asyncio.run(test_network())
