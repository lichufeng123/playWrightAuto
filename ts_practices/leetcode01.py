class Solution(object):
    def isAnagram(self, s, t):
        """
        :type s: str
        :type t: str
        :rtype: bool
        """
        if len(t) != len(s):
            return False
        s = list(s)
        s.sort()
        t = list(t)
        t.sort()
        print(s)
        print(t)


if __name__ == "__main__":
    sol = Solution()          # 先创建类对象
    
    print(sol.isAnagram("anagram","nagaram"))  # 再调用！