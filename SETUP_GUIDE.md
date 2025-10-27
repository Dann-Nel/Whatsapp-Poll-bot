# WhatsApp Poll Bot - Setup Guide

This guide will walk you through the steps required to set up and run the WhatsApp Poll Bot on your Windows machine.

## Prerequisites

Before you begin, please ensure you have the following software installed:

1.  **Python**: You can download it from [python.org](https://www.python.org/downloads/). During installation, make sure to check the box that says "Add Python to PATH".
2.  **Google Chrome**: The bot uses Chrome to automate WhatsApp Web. You can download it from [google.com/chrome](https://www.google.com/chrome/).

---

## Step 1: Download ChromeDriver

The bot needs a specific driver to control the Chrome browser.

1.  **Check your Chrome Version**: Open Chrome, go to the menu (three dots in the top-right), click `Help` -> `About Google Chrome`. Note down the version number (e.g., `123.0.6312.123`).
2.  **Download ChromeDriver**: Go to the Chrome for Testing availability dashboard.
3.  **Find Your Version**: Find the version that matches your browser. Click the `Stable` channel for that version.
4.  **Download the Driver**: In the `chromedriver` row, find the `win64` platform and copy the URL. Paste it into your browser to download the `chromedriver-win64.zip` file.
5.  **Extract and Place**: Unzip the downloaded file. Find `chromedriver.exe` inside the `chromedriver-win64` folder and copy it into the main `whatsapp_poll_bot` folder.

---

## Step 2: Set Up the Python Environment

This step creates an isolated environment for the bot's Python libraries so they don't interfere with other projects.

1.  **Open Command Prompt**: Navigate to the `whatsapp_poll_bot` folder in File Explorer. Click on the address bar, type `cmd`, and press Enter. This will open a command prompt directly in that folder.
2.  **Create Virtual Environment**: In the command prompt, run the following command to create a new folder named `venv`:
    ```
    python -m venv venv
    ```
3.  **Activate Environment**: Now, run this command to activate it. You will see `(venv)` appear at the beginning of your command prompt line.
    ```
    .\venv\Scripts\activate
    ```
4.  **Install Libraries**: Finally, install the necessary libraries using the `requirements.txt` file:
    ```
    pip install -r requirements.txt
    ```

---

## Step 3: Configure the Bot

1.  Open the `config.json` file in a text editor (like Notepad).
2.  Modify the values to suit your needs:
    *   `group_name`: The exact name of the WhatsApp group you want to send the poll to.
    *   `poll_question`: The question for your poll.
    *   `poll_options`: A list of the poll's answer options.
    *   `schedule_day`: The day of the week to send the poll (e.g., "monday", "tuesday").
    *   `schedule_time`: The time to send the poll in 24-hour format (e.g., "09:00" or "17:30").

---

## Step 4: First-Time Login & Running the Bot

The first time you run the bot, you must link it to your WhatsApp account.

1.  Make sure your virtual environment is still active in the command prompt (you should see `(venv)`).
2.  Run the bot by executing the batch file:
    ```
    run_poll_bot.bat
    ```
3.  A new Chrome window will open and navigate to WhatsApp Web. **Use your phone's WhatsApp app to scan the QR code shown on the screen.**
4.  Once you log in, the bot will remember your session for all future runs. It will then wait for the scheduled time to send the poll. You can leave the command prompt window open in the background.