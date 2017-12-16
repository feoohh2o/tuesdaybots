#!/usr/bin/python3.6
import praw
import praw.models
import os
import datetime
import pickle
import json
import logging


logger = logging.getLogger("tuesday")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setLevel(logging.DEBUG)
logger.addHandler(handler)


def find_previous_dt(subreddit, username):
    for post in subreddit.hot(limit=2):
        if post.author.name == username:
            return post


def get_other_announcements(subreddit):
    post = next(subreddit.hot(limit=1))
    if post.stickied:
        return post


def main():
    config_file = os.path.join(os.path.dirname(__file__), 'config.json')
    with open(config_file) as f:
        config = json.load(f)
    now = datetime.datetime.now()
    weekday_today = now.strftime('%A')
    if weekday_today not in config["weekdays"]:
        logger.debug(f"{weekday_today} not in {config['weekdays']}. quitting.")
        return

    reddit = praw.Reddit(**config['credentials'])

    date = now.strftime('%B %-d, %Y')
    title = config['title'].format(date=date)

    subreddit = reddit.subreddit(config['subreddit'])
    body = subreddit.wiki['discussion_thread'].content_md

    previous = find_previous_dt(subreddit, config['credentials']['username'])
    if previous is not None:
        logger.debug(f"Found previous thread at {previous.permalink}")
        previous.mod.sticky(False)
        body += "\n\n[Previous Discussion Thread](https://www.reddit.com{permalink})".format(
            permalink=previous.permalink
        )
    else:
        logging.debug(f"Previous thread not found")

    post = subreddit.submit(title, selftext=body)
    other_announcement = get_other_announcements(subreddit)
    if other_announcement:
        logger.debug(f"Found another announcement: {other_announcement.permalink}")
    logger.debug(f"Posting thread with title {title} to subreddit {subreddit} with body:\n{body}")
    post.mod.distinguish()
    post.mod.sticky(bottom=False)
    post.mod.suggested_sort("new")
    if other_announcement:
        logger.debug(f"Stickying other announcement: {other_announcement.permalink}")
        other_announcement.mod.sticky(bottom=True)
    if previous is not None:
        logger.debug(f"Posting comment in old thread")
        comment = previous.reply(f"[New Discussion Thread is up!]({post.permalink})")
        comment.mod.distinguish(sticky=True)


if __name__ == "__main__":
    main()
