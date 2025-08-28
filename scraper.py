import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import json
import re
import os

def parse_course_html(html_content):
    soup = BeautifulSoup(html_content, 'lxml')
    courses = []

    # Find all course container divs
    course_containers = soup.find_all('div', id=re.compile(r'^win0div\$ICField102\$'))

    for container in course_containers:
        # Extract course title and code
        title_span = container.find('span', id=re.compile(r'^DERIVED_CLSRCH_DESCR200\$'))
        if not title_span:
            continue

        course_text = title_span.get_text(strip=True)
        course_code_match = re.match(r'([A-Z]{4}\s\d{4})', course_text)
        if not course_code_match:
            continue

        course_code = course_code_match.group(1).replace(" ", "")
        course_name = course_text.replace(course_code_match.group(1), '').strip(' -')

        # Find all section tables within the container
        section_tables = container.find_all('table', id=re.compile(r'^ACE_\$ICField106\$'))

        for section_table in section_tables:
            section_links = section_table.find_all('a', id=re.compile(r'^DERIVED_CLSRCH_SSR_CLASSNAME_LONG\$'))

            for section_link in section_links:
                section_text = section_link.get_text(strip=True)

                meeting_table = section_link.find_parent('table', {'class': 'PSLEVEL1SCROLLAREABODY'})
                if not meeting_table:
                    continue

                times = []
                meeting_rows = meeting_table.find_all('tr', id=re.compile(r'^trSSR_CLSRCH_MTG1\$\d+_row\d+'))
                for row in meeting_rows:
                    cols = row.find_all('td')
                    if len(cols) == 4:
                        day_time = cols[0].get_text(strip=True)
                        room = cols[1].get_text(strip=True)
                        instructor = cols[2].get_text(strip=True)

                        day_part = ''.join(re.findall(r'[A-Za-z]+', day_time))
                        time_part = day_time.replace(day_part, '').strip()

                        time_matches = re.findall(r'(\d{1,2}:\d{2}[APM]+)', time_part)
                        start_time = time_matches[0] if len(time_matches) > 0 else ''
                        end_time = time_matches[1] if len(time_matches) > 1 else ''

                        times.append({
                            "day": day_part,
                            "start": start_time,
                            "end": end_time,
                            "room": room,
                            "instructor": instructor
                        })

                course_data = {
                    "id": f"{course_code}-{section_text}",
                    "code": course_code,
                    "name": course_name,
                    "section": section_text,
                    "times": times,
                    "color": "hsla(210, 80%, 80%, 0.8)"
                }
                courses.append(course_data)

    return courses

async def main():
    # Get credentials from environment variables
    username = os.environ.get("HKUST_USERNAME")
    password = os.environ.get("HKUST_PASSWORD")

    if not username or not password:
        print("Please set the HKUST_USERNAME and HKUST_PASSWORD environment variables.")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        login_url = "https://sisp.hkust-gz.edu.cn/psp/gzsisp/EMPLOYEE/HRMS/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?pslnkid=Z_HC_SSS_STUDENT_CENTER_LNK&FolderPath=PORTAL_ROOT_OBJECT.Z_HC_SSS_STUDENT_CENTER_LNK&IsFolder=false&IgnoreParamTempl=FolderPath,IsFolder"

        try:
            print(f"Navigating to {login_url}")
            await page.goto(login_url, wait_until='networkidle')

            # --- Login ---
            await page.fill('input[name="loginfmt"]', username)
            await page.click('input[type="submit"]')
            await page.fill('input[name="passwd"]', password)
            await page.click('input[type="submit"]')
            try:
                # Click "Yes" on "Stay signed in?"
                await page.click('input[id="idSIButton9"]', timeout=5000)
                print("Clicked 'Yes' on 'Stay signed in?' prompt.")
            except Exception:
                print("'Stay signed in?' prompt not detected, continuing.")

            await page.wait_for_load_state('networkidle', timeout=60000)

            # --- Navigate to course search ---
            frame_locator = page.frame_locator('#ptifrmtgtframe')
            await frame_locator.locator('#DERIVED_SSS_SCL_SSS_GO_4\\$83\\$').click()
            await asyncio.sleep(5)

            all_courses = []

            subject_value = "AIAA"
            print(f"Searching for subject: {subject_value}")
            subject_dropdown_selector = '#CLASS_SRCH_WRK2_SUBJECT\\$108\\$'
            await frame_locator.locator(subject_dropdown_selector).select_option(value=subject_value)

            search_button_selector = '#CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH'
            await frame_locator.locator(search_button_selector).click()

            await asyncio.sleep(5)

            search_results_html = await frame_locator.locator('body').inner_html()
            parsed_courses = parse_course_html(search_results_html)
            all_courses.extend(parsed_courses)
            print(f"  - Found {len(parsed_courses)} courses for {subject_value}")

            # Format the data and write to courses.json
            courses_obj = {"courses": all_courses}
            with open('courses.json', 'w', encoding='utf-8') as f:
                json.dump(courses_obj, f, indent=2, ensure_ascii=False)

            print(f"\nSuccessfully parsed a total of {len(all_courses)} courses and updated courses.json.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path="error_screenshot.png")
            content = await page.content()
            with open("error_page.html", "w", encoding="utf-8") as f:
                f.write(content)
            print("Saved error_screenshot.png and error_page.html for debugging.")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
